"""Dong bo lich phat hanh: tab 'Timeline' cua sheet release -> feature_labels.release_date.

Web KHONG doc duoc Google Sheets (service account chi co o bot), nen web xep yeu cau vao
release_sync_requests con day rut hang doi — xem migration 0033.

Sheet phai co tab 'Timeline' voi cot: Version | Date | ...
    Version | Date
    1.0.x   | 6/1/2026
    1.1.x   | 6/19/2026

Chay tay:  python skills/release_sync.py --project <uuid>
"""

import argparse
import datetime
import logging
import sys
from pathlib import Path
from urllib.parse import quote

try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows console -> UTF-8 cho tieng Viet
except Exception:
    pass

# Chay tay (`python skills/release_sync.py`) thi bot/ chua nam tren sys.path — them vao
# de `supabase_client` import duoc. Cung cach cac skill khac lam.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import drive_gateway  # noqa: E402
import sheets_reader  # noqa: E402
from supabase_client import get_client  # noqa: E402

log = logging.getLogger("release_sync")

API = "https://sheets.googleapis.com/v4/spreadsheets"
TIMELINE_TAB = "Timeline"
# Google Sheets dem ngay tu moc nay (cung goc voi Excel, ke ca loi nam nhuan 1900).
_SHEET_EPOCH = datetime.date(1899, 12, 30)


class ReleaseSyncError(RuntimeError):
    """Doc sheet / ghi DB that bai -> caller bao cao roi bo qua."""


def _serial_to_date(serial):
    """So thu tu ngay cua Sheets -> date.

    DOC SERIAL THO chu khong doc chuoi da format: '6/1/2026' khong biet la 1/6 hay 6/1 —
    doan sai la lech ca lich phat hanh nam thang.
    """
    if isinstance(serial, bool) or not isinstance(serial, (int, float)):
        return None
    return _SHEET_EPOCH + datetime.timedelta(days=int(serial))


def read_schedule(sess, sheet_id: str) -> dict:
    """Tab 'Timeline' -> {ten version: date}. Nem ReleaseSyncError khi doc that bai."""
    rng = quote(f"{sheets_reader._quote(TIMELINE_TAB)}!A1:B200", safe="")
    try:
        r = sess.get(
            f"{API}/{sheet_id}/values/{rng}",
            params={"majorDimension": "ROWS", "valueRenderOption": "UNFORMATTED_VALUE"},
            timeout=60,
        )
    except Exception as e:
        raise ReleaseSyncError(f"gọi Sheets API thất bại: {e}") from e
    if not r.ok:
        raise ReleaseSyncError(
            f"đọc tab '{TIMELINE_TAB}' thất bại (HTTP {r.status_code}). Sheet có tab đó "
            f"và đã share cho service account chưa? — {r.text[:120]}"
        )

    out = {}
    for row in r.json().get("values", []):
        if len(row) < 2:
            continue
        name = str(row[0]).strip()
        day = _serial_to_date(row[1])
        # Bo dong tieu de va dong ghi ngay bang chu tay: khong parse duoc thi bo qua chu
        # khong doan — dat sai ngay phat hanh con te hon la khong dat.
        if name and day:
            out[name] = day
    return out


def sync_project(sb, project_id: str) -> str:
    """Dong bo lich cho MOT du an -> cau tom tat cho nguoi doc. Nem ReleaseSyncError."""
    proj = (
        sb.table("projects").select("name, release_sheet_id").eq("id", project_id).single().execute().data
    )
    if not proj:
        raise ReleaseSyncError("không tìm thấy dự án")
    sheet_id = (proj.get("release_sheet_id") or "").strip()
    if not sheet_id:
        raise ReleaseSyncError(
            "dự án chưa khai release_sheet_id (tab Cấu hình) — chưa biết đọc sheet nào"
        )

    sess = drive_gateway.make_session(drive_gateway.resolve_key())
    schedule = read_schedule(sess, sheet_id)
    if not schedule:
        raise ReleaseSyncError(f"tab '{TIMELINE_TAB}' không có dòng version nào đọc được")

    labels = (
        sb.table("feature_labels").select("id, name, release_date").eq("project_id", project_id).execute().data
    ) or []
    by_name = {str(l["name"]).strip().lower(): l for l in labels}

    changed, unchanged, missing = [], 0, []
    for name, day in schedule.items():
        label = by_name.get(name.lower())
        if not label:
            # Sheet co version ma app chua co nhan -> BAO, khong tu tao: nhan la thu nguoi
            # dung gan tay vao feature, de bot de ra thi lac nhan luc nao khong biet.
            missing.append(name)
            continue
        if (label.get("release_date") or None) == day.isoformat():
            unchanged += 1
            continue
        sb.table("feature_labels").update({"release_date": day.isoformat()}).eq("id", label["id"]).execute()
        changed.append(f"{name} → {day.strftime('%d/%m/%Y')}")

    parts = [f"{len(changed)} đổi, {unchanged} giữ nguyên"]
    if changed:
        parts.append("; ".join(changed))
    if missing:
        parts.append(f"chưa có nhãn trong app: {', '.join(missing)}")
    return " · ".join(parts)


def main():
    ap = argparse.ArgumentParser(description="Đồng bộ lịch phát hành từ sheet release")
    ap.add_argument("--project", required=True, help="id dự án")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    try:
        print(sync_project(get_client(), args.project))
    except (ReleaseSyncError, drive_gateway.DriveError) as e:
        print(f"LỖI: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
