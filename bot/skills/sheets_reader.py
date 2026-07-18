"""Doc noi dung mot Google Sheet qua Sheets API -> list (section, text).

CUNG HOP DONG voi doc_reader.read_sections (list (section, text)) nen build_pairs() cat
chunk duoc y het file cuc bo.

Sinh ra cho DUNG MOT truong hop: sheet lon hon 10MB thi Drive tu choi export .xlsx
('exportSizeLimitExceeded') -> khong tai ve doc bang openpyxl duoc. Sheets API doc theo
VUNG (A1 range) nen khong dinh gioi han do.

Dung CHUNG session/service account voi drive_gateway (scope drive.readonly du de DOC
Sheets API — khong can xin them quyen ghi nhu sheets_gateway.py).
"""

import requests

API = "https://sheets.googleapis.com/v4/spreadsheets"
MAX_ROWS_PER_TAB = 3000  # chan sheet khong lo; con xa tran chunk cua drive_ingest
_MAX_COL = "ZZ"
_TIMEOUT = 90
_BATCH_TABS = 20  # so tab moi lan batchGet (URL qua dai neu nhet het vao 1 lan)


class SheetReadError(RuntimeError):
    """Doc Sheets API that bai -> caller bao cao va bo qua file do."""


def _check(r: requests.Response, what: str):
    if not r.ok:
        raise SheetReadError(f"{what}: HTTP {r.status_code} — {r.text[:150]}")


def _quote(tab: str) -> str:
    """Ten tab trong dia chi A1 phai boc nhay don; nhay don ben trong -> nhan doi."""
    return "'" + tab.replace("'", "''") + "'"


def tab_titles(sess: requests.Session, sheet_id: str) -> list:
    """Ten cac tab trong file (theo thu tu hien thi)."""
    try:
        r = sess.get(f"{API}/{sheet_id}", params={"fields": "sheets.properties.title"},
                     timeout=_TIMEOUT)
    except requests.RequestException as e:
        raise SheetReadError(f"gọi Sheets API thất bại: {e}") from e
    _check(r, "đọc danh sách tab")
    return [s["properties"]["title"] for s in r.json().get("sheets", [])]


def tab_gids(sess: requests.Session, sheet_id: str) -> dict:
    """{ten tab: gid} — gid la so sau lung '#gid=' de link toi DUNG tab.

    Mot lan goi (fields=sheets.properties(sheetId,title)) du re: dung de nap RAG biet
    tab nao thi mo o dia chi nao. Nem SheetReadError khi loi (caller van co link file).
    """
    try:
        r = sess.get(f"{API}/{sheet_id}",
                     params={"fields": "sheets.properties(sheetId,title)"}, timeout=_TIMEOUT)
    except requests.RequestException as e:
        raise SheetReadError(f"gọi Sheets API thất bại: {e}") from e
    _check(r, "đọc gid các tab")
    return {s["properties"]["title"]: s["properties"]["sheetId"]
            for s in r.json().get("sheets", [])}


def _fetch_ranges(sess: requests.Session, sheet_id: str, tabs: list) -> list:
    """batchGet nhieu tab 1 lan -> list valueRange (cung thu tu ranges gui di)."""
    ranges = [f"{_quote(t)}!A1:{_MAX_COL}{MAX_ROWS_PER_TAB}" for t in tabs]
    try:
        r = sess.get(f"{API}/{sheet_id}/values:batchGet",
                     params={"ranges": ranges, "majorDimension": "ROWS"}, timeout=_TIMEOUT)
    except requests.RequestException as e:
        raise SheetReadError(f"gọi Sheets API thất bại: {e}") from e
    _check(r, "đọc dữ liệu tab")
    return r.json().get("valueRanges", [])


def _rows_to_text(rows: list) -> str:
    """Cac hang gia tri -> van ban 'o | o | o' moi dong (giong doc_reader._read_xlsx)."""
    lines = []
    for row in rows:
        vals = [str(c).strip() for c in row if str(c).strip()]
        if vals:
            lines.append(" | ".join(vals))
    return "\n".join(lines)


def read_sheet(sess: requests.Session, sheet_id: str) -> list:
    """Doc MOI tab -> list (section, text). Tab rong bi bo qua. Nem SheetReadError khi loi."""
    tabs = tab_titles(sess, sheet_id)
    if not tabs:
        return []
    out = []
    for i in range(0, len(tabs), _BATCH_TABS):
        batch = tabs[i:i + _BATCH_TABS]
        for tab, vr in zip(batch, _fetch_ranges(sess, sheet_id, batch)):
            text = _rows_to_text(vr.get("values", []))
            if text:
                out.append((f"sheet '{tab}'", text))
    return out
