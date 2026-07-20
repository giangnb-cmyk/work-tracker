"""Cong (gateway) dong bo task sang Notion. POST toi 1 endpoint duy nhat cua web.

Token Notion nam o phia server (web/api/notion.ts) - bot KHONG giu token, chi
xac thuc bang shared secret gui qua header 'x-sync-secret'.

Nguyen tac: degrade GRACEFULLY. Neu chua cau hinh URL/secret hoac goi loi ->
log canh bao va tra {"synced": False}. TUYET DOI khong lam hong lenh ghi Firestore.
"""

import json
import logging
import os

log = logging.getLogger("notion_gateway")

_TIMEOUT = 10  # giay
_GATEWAY_URL_ENV = "NOTION_GATEWAY_URL"
_SECRET_ENV = "NOTION_SYNC_SECRET"

# Sentinel: phan biet "khong truyen" voi "truyen None (go link)".
# WHY: gateway chi dung den relation Project khi key CO MAT trong payload
# (`input.notionProjectId !== undefined` — web/api/_notion.ts). Update ma gui
# key = None se XOA relation, nen update khong truyen gi thi phai vang key han.
_OMIT = object()


def is_configured() -> bool:
    """Da dat ca URL gateway va secret hay chua."""
    return bool(os.getenv(_GATEWAY_URL_ENV) and os.getenv(_SECRET_ENV))


def _task_payload(task: dict, assignee_notion_user_id, notion_project_id=_OMIT) -> dict:
    """Ep task ve dung shape NotionTaskInput cua gateway.

    dueDate tra ve 'YYYY-MM-DD' hoac None; chi lay dung cac truong gateway can.
    notion_project_id de mac dinh _OMIT -> khong dung toi relation Project.
    """
    payload = {
        "title": task.get("title", ""),
        "status": task.get("status", ""),
        "priority": task.get("priority", ""),
        "assigneeName": task.get("assigneeName", ""),
        "assigneeNotionUserId": assignee_notion_user_id,
        "dueStart": _due_str(task.get("dueStart")),
        "dueDate": _due_str(task.get("dueDate")),
        "description": task.get("description", ""),
    }
    if notion_project_id is not _OMIT:
        payload["notionProjectId"] = notion_project_id
    return payload


def _due_str(due):
    """Chuyen dueDate (datetime/Timestamp/str) ve 'YYYY-MM-DD' hoac None."""
    if not due:
        return None
    if hasattr(due, "strftime"):
        return due.strftime("%Y-%m-%d")
    return str(due)[:10]


def create_page(task: dict, assignee_notion_user_id=None, notion_project_id=None) -> dict:
    """Tao page Notion cho task moi. Tra ve {synced, notionPageId, notionUrl}.

    notion_project_id: id page ben Notion Projects-DB (lay tu projects.notion_project_id)
    de gan relation Project — giong het duong web di qua createTask().
    """
    body = {
        "action": "create",
        "task": _task_payload(task, assignee_notion_user_id, notion_project_id),
    }
    return _post(body)


def list_projects() -> list:
    """Danh sach project ben Notion de link luc tao project: [{id, name}, ...].

    Dung khi admin tao project qua Discord (giong ProjectModal ben web goi
    listNotionProjects). Loi/chua cau hinh -> tra list rong, khong nem.
    """
    payload = _post({"action": "list-projects"})
    return payload.get("projects") or []


def update_page(notion_page_id: str, task: dict, assignee_notion_user_id=None) -> dict:
    """Cap nhat page Notion da lien ket. Tra ve {synced, ...}."""
    if not notion_page_id:
        return {"synced": False}
    body = {
        "action": "update",
        "notionPageId": notion_page_id,
        "task": _task_payload(task, assignee_notion_user_id),
    }
    return _post(body)


def archive_page(notion_page_id: str) -> dict:
    """Dua page Notion vao Trash (archived) khi xoa task. Tra ve {synced, ...}.

    Giong duong web (deleteTask -> archiveNotionPage): Notion khong xoa vinh vien duoc,
    archived=true giu 30 ngay de con khoi phuc neu lo tay.
    """
    if not notion_page_id:
        return {"synced": False}
    return _post({"action": "archive", "notionPageId": notion_page_id})


def _post(body: dict) -> dict:
    """Gui POST toi gateway. Nuot moi loi -> {'synced': False, 'reason': ...} + log.

    Luon kem 'reason' NGAN GON de caller (task_ops) thuat lai duoc "vi sao khong sync",
    thay vi mot cau "bo qua" tron troi buoc phai mo log may chay bot moi biet.
    """
    url = os.getenv(_GATEWAY_URL_ENV)
    secret = os.getenv(_SECRET_ENV)
    if not url or not secret:
        log.warning("Notion gateway chưa cấu hình (thiếu %s/%s), bỏ qua sync.",
                    _GATEWAY_URL_ENV, _SECRET_ENV)
        return {"synced": False, "reason": f"thiếu {_GATEWAY_URL_ENV}/{_SECRET_ENV} trong bot/.env"}

    # Import lazy: neu chua cai 'requests' thi cung degrade nhe, khong vo import task_ops.
    try:
        import requests
    except ImportError:
        log.warning("Chưa cài 'requests' (pip install requests), bỏ qua sync Notion.")
        return {"synced": False, "reason": "chưa cài 'requests'"}

    try:
        resp = requests.post(
            url,
            json=body,
            headers={"x-sync-secret": secret},
            timeout=_TIMEOUT,
        )
    except Exception as e:  # timeout, DNS... -> khong lam hong Postgres
        log.warning("Notion gateway lỗi mạng: %s", str(e)[:200])
        return {"synced": False, "reason": f"gọi gateway lỗi mạng: {str(e)[:120]}"}

    # HTTP loi (401/500/502...): body co the la JSON cua ta (co 'detail') hoac trang loi
    # cua Vercel. Doc detail neu co, khong thi kem status + dau doan body.
    try:
        payload = resp.json()
    except ValueError:
        payload = None
    if not resp.ok:
        detail = (payload or {}).get("detail") or (payload or {}).get("error") or resp.text[:120]
        log.warning("Notion gateway HTTP %s: %s", resp.status_code, detail)
        return {"synced": False, "reason": f"gateway HTTP {resp.status_code} — {detail}"}
    if not isinstance(payload, dict):
        return {"synced": False, "reason": "gateway trả về không phải JSON"}
    # Gateway 200 nhung synced=False (vd notion_not_configured) -> giu nguyen reason cua no.
    if not payload.get("synced") and "reason" not in payload:
        payload["reason"] = payload.get("error") or "gateway báo chưa đồng bộ"
    return payload
