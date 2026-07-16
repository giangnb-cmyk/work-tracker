"""Cong I/O toi Google Sheets API (service account). Thuan I/O — KHONG chua logic report.

Dung google-auth + requests, giong drive_catalog.py, CO Y khong keo them
google-api-python-client: ca repo chi can vai endpoint REST, khong dang doi mot dependency
nang chi de goi 3 URL.

Dung CHUNG service account voi drive_catalog.py / Google Sheets MCP
(keys/service-account-gsheets.json — xem GOOGLE_SHEETS_MCP.md).

CANH BAO PHAM VI QUYEN: GOOGLE_SHEETS_MCP.md thiet ke setup nay la CHI DOC (share Drive
quyen Viewer). Module nay can quyen GHI de dien weekly report, nen file sheet cua tung
project phai duoc share rieng quyen Editor cho email service account. Chi share DUNG file
can ghi — dung nang ca folder len Editor.
"""

import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import requests

_BOT_DIR = Path(__file__).resolve().parent.parent
_REPO_ROOT = _BOT_DIR.parent
DEFAULT_KEY_PATH = _REPO_ROOT / "keys" / "service-account-gsheets.json"

_API = "https://sheets.googleapis.com/v4/spreadsheets"
_TIMEOUT = 30
# spreadsheets = doc + ghi. Doc khong thi dung .readonly, nhung skill nay sinh ra de ghi.
_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


class SheetsError(Exception):
    """Loi goi Sheets API — caller tu quyet in ra sao."""


def session(key_path: Path | None = None) -> requests.Session:
    """Doc service account JSON -> Session da gan Bearer token."""
    path = Path(key_path) if key_path else DEFAULT_KEY_PATH
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request
    except ImportError as e:
        raise SheetsError(
            "thiếu thư viện google-auth. Cài: pip install -r bot/requirements.txt"
        ) from e
    if not path.exists():
        raise SheetsError(
            f"không thấy service account key '{path}'. Xem bot/GOOGLE_SHEETS_MCP.md Bước 1."
        )
    creds = service_account.Credentials.from_service_account_file(str(path), scopes=_SCOPES)
    creds.refresh(Request())
    sess = requests.Session()
    sess.headers["Authorization"] = f"Bearer {creds.token}"
    return sess


def _check(resp: requests.Response, what: str):
    if resp.status_code == 403:
        raise SheetsError(
            f"{what}: bị từ chối (403). Service account chưa được share quyền Editor trên "
            f"file này. Mở Sheet → Share → dán email service account → Editor."
        )
    if resp.status_code == 404:
        raise SheetsError(f"{what}: không thấy sheet (404). Sai spreadsheet id, hoặc chưa share.")
    if not resp.ok:
        raise SheetsError(f"{what}: HTTP {resp.status_code} — {resp.text[:200]}")


def tab_titles(sess: requests.Session, sheet_id: str) -> list[str]:
    """Ten cac tab trong file."""
    r = sess.get(f"{_API}/{sheet_id}", params={"fields": "sheets.properties.title"}, timeout=_TIMEOUT)
    _check(r, "đọc thông tin sheet")
    return [s["properties"]["title"] for s in r.json().get("sheets", [])]


def tab_grid(sess: requests.Session, sheet_id: str, tab: str) -> tuple[int, int, int]:
    """(sheetId noi bo, so hang, so cot) cua mot tab."""
    r = sess.get(f"{_API}/{sheet_id}",
                 params={"fields": "sheets.properties(sheetId,title,gridProperties)"},
                 timeout=_TIMEOUT)
    _check(r, "đọc kích thước tab")
    for s in r.json().get("sheets", []):
        p = s["properties"]
        if p.get("title") == tab:
            g = p.get("gridProperties", {})
            return p["sheetId"], g.get("rowCount", 0), g.get("columnCount", 0)
    raise SheetsError(f"không thấy tab '{tab}' trong sheet")


def ensure_columns(sess: requests.Session, sheet_id: str, tab: str, need_index0: int) -> int:
    """Bao dam tab co cot tai `need_index0`. Tra ve so cot da them (0 = du roi).

    WHY: grid cua Sheet co bien that. Tab 'Discussion' dung dung 50 cot (A..AX) — cot tuan
    cuoi CHINH LA cot cuoi cua grid. Ghi thang vao cot tuan moi (AY) se nhan
    '400 exceeds grid limits' chu khong tu gian ra. Phai appendDimension truoc.
    """
    _, _, cols = tab_grid(sess, sheet_id, tab)
    if need_index0 < cols:
        return 0
    add = need_index0 - cols + 1
    tab_id, _, _ = tab_grid(sess, sheet_id, tab)
    r = sess.post(
        f"{_API}/{sheet_id}:batchUpdate",
        json={"requests": [{"appendDimension": {
            "sheetId": tab_id, "dimension": "COLUMNS", "length": add}}]},
        timeout=_TIMEOUT,
    )
    _check(r, f"thêm {add} cột cho tab '{tab}'")
    return add


def get_values(sess: requests.Session, sheet_id: str, a1: str, by_columns: bool = False) -> list:
    """Doc mot vung A1. by_columns=True -> tra ve theo COT thay vi theo hang."""
    r = sess.get(
        f"{_API}/{sheet_id}/values/{a1}",
        params={"majorDimension": "COLUMNS" if by_columns else "ROWS"},
        timeout=_TIMEOUT,
    )
    _check(r, f"đọc vùng {a1}")
    return r.json().get("values", [])


def update_values(sess: requests.Session, sheet_id: str, a1: str, values: list) -> int:
    """Ghi de mot vung A1 (values theo HANG). Tra ve so o da ghi."""
    r = sess.put(
        f"{_API}/{sheet_id}/values/{a1}",
        params={"valueInputOption": "RAW"},
        json={"values": values},
        timeout=_TIMEOUT,
    )
    _check(r, f"ghi vùng {a1}")
    return r.json().get("updatedCells", 0)


def update_rich(sess: requests.Session, sheet_id: str, tab: str,
                col0: int, row: int, lines: list) -> None:
    """Ghi MOT o voi bold TUNG DOAN. `lines` = danh sach dong, moi dong la list
    (doan_chu, co_bold) — xem ga4_metrics.Segment.

    update_values chi ghi duoc chuoi tron; bold tung doan trong o phai dung
    updateCells + textFormatRuns. LUU Y: startIndex cua run dem theo UTF-16 code unit —
    tieng Viet nam tron trong BMP nen trung voi chi so Python, nhung DUNG nhet emoji
    (ngoai BMP) vao noi dung o nay.
    """
    text, runs, bold_now = "", [], None

    def emit(seg: str, bold: bool):
        nonlocal text, bold_now
        if not seg:
            return
        if bold_now != bold:
            runs.append({"startIndex": len(text),
                         "format": {"bold": True} if bold else {}})
            bold_now = bold
        text += seg

    for i, segs in enumerate(lines):
        if i:
            emit("\n", False)
        for seg, bold in segs:
            emit(seg, bold)

    tab_id, _, _ = tab_grid(sess, sheet_id, tab)
    r = sess.post(
        f"{_API}/{sheet_id}:batchUpdate",
        json={"requests": [{"updateCells": {
            "rows": [{"values": [{
                "userEnteredValue": {"stringValue": text},
                "textFormatRuns": runs,
            }]}],
            "fields": "userEnteredValue,textFormatRuns",
            "start": {"sheetId": tab_id, "rowIndex": row - 1, "columnIndex": col0},
        }}]},
        timeout=_TIMEOUT,
    )
    _check(r, f"ghi (định dạng) ô {col_name(col0)}{row}")


def col_name(index0: int) -> str:
    """0 -> A, 25 -> Z, 26 -> AA. Sheets khong nhan chi so cot trong dia chi A1."""
    if index0 < 0:
        raise ValueError("chỉ số cột không được âm")
    name = ""
    n = index0 + 1
    while n:
        n, rem = divmod(n - 1, 26)
        name = chr(65 + rem) + name
    return name
