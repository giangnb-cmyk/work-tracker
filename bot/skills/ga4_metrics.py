"""Chi so GA4 (Google Analytics Data API) cho weekly report — thuan fetch + dung noi dung.

KHONG cham Google Sheets va KHONG import supabase: module nay chi tra ve cac dong dang
(doan_chu, co_bold) de sheets_gateway.update_rich ma hoa thanh textFormatRuns. Nho vay
test duoc doc lap va weekly_report chi viec ghep.

Quyen: dung CHUNG service account voi sheets_gateway (keys/service-account-gsheets.json).
SA phai duoc them vao GA4 property (Admin > Property access management) quyen Viewer, va
project GCP cua SA phai bat Analytics Data API. Property id cau hinh theo project trong
bot/settings.json ("ga4_properties").

Format do team chot (2026-07-16): tach khoi theo platform (Android/iOS), so tuan truoc
de trong ngoac. "Time choi TB moi session" = userEngagementDuration / sessions — CO Y
khong dung averageSessionDuration cua GA vi metric do dem ca luc treo may (session mo
ma khong choi), doc len mau thuan voi time choi/nguoi.
"""

import sys
from datetime import date, timedelta
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

_BOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_KEY_PATH = _BOT_DIR.parent / "keys" / "service-account-gsheets.json"

_API = "https://analyticsdata.googleapis.com/v1beta/properties"
_SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"]
_TIMEOUT = 30

# Danh dau noi dung do BOT ghi — o bat dau bang chuoi nay thi lan chay sau duoc phep
# lam moi; con lai coi nhu nguoi that viet tay, khong dong vao.
MARKER = "[GA4]"

# (doan chu, co in dam khong) — don vi dung chuoi cho update_rich.
Segment = tuple[str, bool]

# Gia tri dimension `platform` cua GA4 -> nhan hien thi.
PLATFORMS = [("ANDROID", "Android"), ("IOS", "iOS")]

_METRICS = ["activeUsers", "newUsers", "sessions", "userEngagementDuration",
            "sessionsPerUser"]


class Ga4Error(Exception):
    """Loi goi GA4 — caller tu quyet in ra sao (weekly report chi log roi di tiep)."""


def session(key_path: Path | None = None):
    """Doc service account JSON -> requests.Session gan Bearer token (chi doc GA4)."""
    import requests

    path = Path(key_path) if key_path else DEFAULT_KEY_PATH
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request
    except ImportError as e:
        raise Ga4Error(
            "thiếu thư viện google-auth. Cài: pip install -r bot/requirements.txt"
        ) from e
    if not path.exists():
        raise Ga4Error(f"không thấy service account key '{path}'.")
    creds = service_account.Credentials.from_service_account_file(str(path), scopes=_SCOPES)
    creds.refresh(Request())
    sess = requests.Session()
    sess.headers["Authorization"] = f"Bearer {creds.token}"
    return sess


def _run_report(sess, property_id: str, body: dict) -> dict:
    resp = sess.post(f"{_API}/{property_id}:runReport", json=body, timeout=_TIMEOUT)
    if resp.status_code == 403:
        raise Ga4Error(
            "GA4 từ chối (403): service account chưa được thêm vào property "
            f"{property_id} (quyền Viewer), hoặc project GCP của SA chưa bật "
            "Analytics Data API."
        )
    if not resp.ok:
        raise Ga4Error(f"GA4 HTTP {resp.status_code} — {resp.text[:200]}")
    return resp.json()


def _platform_filter(platform: str) -> dict:
    return {"filter": {"fieldName": "platform", "stringFilter": {"value": platform}}}


def _totals(sess, property_id: str, start: date, end: date, platform: str) -> dict:
    data = _run_report(sess, property_id, {
        "dateRanges": [{"startDate": start.isoformat(), "endDate": end.isoformat()}],
        "metrics": [{"name": m} for m in _METRICS],
        "dimensionFilter": _platform_filter(platform),
    })
    rows = data.get("rows", [])
    vals = rows[0]["metricValues"] if rows else [{"value": "0"}] * len(_METRICS)
    return {m: float(v["value"]) for m, v in zip(_METRICS, vals)}


def _d1_retention(sess, property_id: str, cohort_days: list[date],
                  platform: str) -> float | None:
    """D1 retention gop (weighted) cua cac cohort `firstSessionDate`, loc theo platform.

    Caller chi truyen cohort ma NGAY HOM SAU da tron ven — D1 roi vao hom nay se
    thap gia tao vi so lieu hom nay chua chot.
    """
    if not cohort_days:
        return None
    data = _run_report(sess, property_id, {
        "dimensions": [{"name": "cohort"}, {"name": "cohortNthDay"}],
        "metrics": [{"name": "cohortActiveUsers"}],
        "dimensionFilter": _platform_filter(platform),
        "cohortSpec": {
            "cohorts": [
                {"dimension": "firstSessionDate", "name": f"c{d:%m%d}",
                 "dateRange": {"startDate": d.isoformat(), "endDate": d.isoformat()}}
                for d in cohort_days
            ],
            "cohortsRange": {"granularity": "DAILY", "startOffset": 0, "endOffset": 1},
        },
    })
    day0: dict[str, int] = {}
    day1: dict[str, int] = {}
    for r in data.get("rows", []):
        name = r["dimensionValues"][0]["value"]
        nth = r["dimensionValues"][1]["value"]
        (day0 if nth == "0000" else day1)[name] = int(r["metricValues"][0]["value"])
    base = sum(day0.values())
    if base == 0:
        return None
    return sum(day1.get(name, 0) for name in day0) / base


# --- Chon cua so thoi gian -----------------------------------------------------

def report_windows(week_start: date, today: date) -> tuple[tuple[date, date], tuple[date, date]]:
    """((bat dau, ket thuc) ky chinh, (bat dau, ket thuc) ky so sanh).

    - Tuan cua cot da TRON (hoac dang giua tuan, >=2 ngay du lieu): ky chinh la tuan do
      (cat den hom nay neu chua het tuan).
    - Chay SANG THU 2 (cot tuan moi chi co 0-1 ngay): bao cao tuan VUA KET THUC — dung
      luc weekly meeting can, thay vi mot cot gan nhu trong.
    Ky so sanh luon la 7 ngay lien truoc ky chinh.
    """
    week_end = week_start + timedelta(days=6)
    if (today - week_start).days >= 1:
        cur = (week_start, min(today, week_end))
    else:
        cur = (week_start - timedelta(days=7), week_start - timedelta(days=1))
    prev = (cur[0] - timedelta(days=7), cur[0] - timedelta(days=1))
    return cur, prev


# --- Dinh dang -------------------------------------------------------------------

def _fmt_int(n: float) -> str:
    return f"{int(round(n)):,}".replace(",", ".")


def _fmt_mmss(seconds: float) -> str:
    m, s = divmod(int(round(seconds)), 60)
    return f"{m}p{s:02d}s"


def _fmt_pct(x: float | None) -> str:
    return "n/a" if x is None else f"{x * 100:.0f}%"


def _metric_line(label: str, cur_txt: str, prev_txt: str) -> list[Segment]:
    return [(f"- {label}: ", False), (cur_txt, True),
            (" (", False), (prev_txt, True), (")", False)]


def _platform_block(label: str, cur: dict, prev: dict,
                    d1_cur: float | None, d1_prev: float | None) -> list[list[Segment]]:
    cu = cur["activeUsers"] or 1
    pu = prev["activeUsers"] or 1
    cur_per_sess = cur["userEngagementDuration"] / (cur["sessions"] or 1)
    prev_per_sess = prev["userEngagementDuration"] / (prev["sessions"] or 1)
    return [
        [(label, True)],
        _metric_line("Retention D1", _fmt_pct(d1_cur), _fmt_pct(d1_prev)),
        _metric_line("Time chơi",
                     f"{cur['userEngagementDuration'] / cu / 60:.0f}m/người",
                     f"{prev['userEngagementDuration'] / pu / 60:.0f}m"),
        _metric_line("Session",
                     f"{cur['sessionsPerUser']:.1f}/người".replace(".", ","),
                     f"{prev['sessionsPerUser']:.1f}".replace(".", ",")),
        _metric_line("Time chơi TB mỗi session",
                     _fmt_mmss(cur_per_sess), _fmt_mmss(prev_per_sess)),
        _metric_line("Người dùng",
                     f"{_fmt_int(cur['activeUsers'])}, mới {_fmt_int(cur['newUsers'])}",
                     f"{_fmt_int(prev['activeUsers'])}, mới {_fmt_int(prev['newUsers'])}"),
    ]


# --- API chinh --------------------------------------------------------------------

def build_section(sess, property_id: str, week_start: date,
                  today: date | None = None) -> list[list[Segment]]:
    """Cac dong 'Chi so san pham' cho cot tuan `week_start` — moi platform mot khoi."""
    today = today or date.today()
    (cs, ce), (ps, pe) = report_windows(week_start, today)
    partial = ce == today and ce < cs + timedelta(days=6)
    header = (f"{MARKER} Tuần {cs:%d/%m}–{cs + timedelta(days=6):%d/%m}, tính đến {ce:%d/%m}"
              if partial else f"{MARKER} Tuần {cs:%d/%m}–{ce:%d/%m} (đủ tuần)")
    header += f" — số trong (ngoặc) là tuần trước {ps:%d/%m}–{pe:%d/%m}:"

    # D1 chi tinh cohort co ngay-hom-sau da tron ven.
    cur_cohorts = [cs + timedelta(days=i) for i in range((ce - cs).days + 1)
                   if cs + timedelta(days=i + 1) < today]
    prev_cohorts = [ps + timedelta(days=i) for i in range(7)
                    if ps + timedelta(days=i + 1) < today]

    lines: list[list[Segment]] = [[(header, False)]]
    for code, label in PLATFORMS:
        cur = _totals(sess, property_id, cs, ce, code)
        prev = _totals(sess, property_id, ps, pe, code)
        if cur["activeUsers"] == 0 and prev["activeUsers"] == 0:
            continue
        d1_cur = _d1_retention(sess, property_id, cur_cohorts, code)
        d1_prev = _d1_retention(sess, property_id, prev_cohorts, code)
        lines.append([("", False)])
        lines += _platform_block(label, cur, prev, d1_cur, d1_prev)

    if len(lines) == 1:
        lines.append([("(chưa có dữ liệu trong kỳ)", False)])
    return lines


def plain_text(lines: list[list[Segment]]) -> str:
    """Ban chu tron (bo bold) — dung cho --dry-run va log."""
    return "\n".join("".join(seg for seg, _ in line) for line in lines)
