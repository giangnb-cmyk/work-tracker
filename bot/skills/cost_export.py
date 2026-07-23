"""Xuat bang CHI PHI du an ra Google Sheet (bang cost_export_requests, migration 0060).

Web da TINH SAN toan bo so lieu (engine buildCostSeries ben web — mot nguon su that,
khong nhan doi cong thuc sang Python) va nhet vao payload:
    { "tab": "Chi phí (auto)", "sections": [ { "name": str, "rows": [[...], ...] }, ... ] }
Bot chi viec GHI vao sheet da cau hinh (projects.cost_sheet_id — file RIENG co LUONG,
phai share Editor cho service account; xem sheets_gateway).

Chay tu vong poll cua bot.py (cung nhip bug_sync_poll_seconds). Moi yeu cau ghi de tab
(clear + write) nen bam Xuat nhieu lan vo hai.
"""

import datetime
import logging
import sys
from pathlib import Path

# Skill chay ca 2 kieu: import tu bot.py (skills dir da tren sys.path) hoac chay tay.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import sheets_gateway as sg  # noqa: E402

log = logging.getLogger("bot.cost_export")

TABLE = "cost_export_requests"
DEFAULT_TAB = "Chi phí (auto)"


def _flatten(payload: dict) -> list[list]:
    """sections -> mot mang hang: [TEN KHOI] + rows + dong trong ngan cach."""
    out: list[list] = []
    for sec in payload.get("sections") or []:
        out.append([str(sec.get("name") or "")])
        for row in sec.get("rows") or []:
            out.append(list(row))
        out.append([])  # dong trong ngan cach giua cac khoi
    return out


def _process_one(sb, req: dict) -> tuple[str, str]:
    """Ghi MOT yeu cau. Tra ve (status, result) — caller cap nhat dong queue."""
    pid = req.get("project_id")
    res = sb.table("projects").select("cost_sheet_id,name").eq("id", pid).limit(1).execute()
    row = res.data[0] if res.data else None
    sheet_id = (row or {}).get("cost_sheet_id")
    if not sheet_id:
        return "error", "dự án chưa cấu hình cost_sheet_id (⚙ sửa dự án → Google Sheet CHI PHÍ)"

    payload = req.get("payload") or {}
    tab = str(payload.get("tab") or DEFAULT_TAB)
    values = _flatten(payload)
    if not values:
        return "error", "payload rỗng — thử bấm Xuất lại từ web"

    sess = sg.session()
    sg.ensure_tab(sess, sheet_id, tab)
    sg.clear_tab(sess, sheet_id, tab)
    cells = sg.update_values(sess, sheet_id, f"'{tab}'!A1", values)
    return "done", f"đã ghi {len(values)} dòng ({cells} ô) vào tab '{tab}'"


def process_pending(sb) -> int:
    """Xu ly moi yeu cau pending (cu truoc). Tra ve so yeu cau da xong."""
    res = sb.table(TABLE).select("*").eq("status", "pending").order("created_at").execute()
    done = 0
    for req in res.data or []:
        try:
            status, result = _process_one(sb, req)
        except sg.SheetsError as e:
            status, result = "error", str(e)[:300]
        except Exception as e:  # noqa: BLE001 — queue phai song sot moi loi le
            log.exception("Xuất chi phí lỗi (request %s)", req.get("id"))
            status, result = "error", f"lỗi không lường trước: {e}"[:300]
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        sb.table(TABLE).update(
            {"status": status, "result": result, "processed_at": now_iso}
        ).eq("id", req["id"]).execute()
        if status == "done":
            done += 1
        log.info("Xuất chi phí %s: %s — %s", req.get("id"), status, result)
    return done
