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


def is_configured() -> bool:
    """Da dat ca URL gateway va secret hay chua."""
    return bool(os.getenv(_GATEWAY_URL_ENV) and os.getenv(_SECRET_ENV))


def _task_payload(task: dict, assignee_notion_user_id) -> dict:
    """Ep task Firestore ve dung shape NotionTaskInput cua gateway.

    dueDate tra ve 'YYYY-MM-DD' hoac None; chi lay dung cac truong gateway can.
    """
    return {
        "title": task.get("title", ""),
        "status": task.get("status", ""),
        "priority": task.get("priority", ""),
        "assigneeName": task.get("assigneeName", ""),
        "assigneeNotionUserId": assignee_notion_user_id,
        "dueDate": _due_str(task.get("dueDate")),
        "description": task.get("description", ""),
    }


def _due_str(due):
    """Chuyen dueDate (datetime/Timestamp/str) ve 'YYYY-MM-DD' hoac None."""
    if not due:
        return None
    if hasattr(due, "strftime"):
        return due.strftime("%Y-%m-%d")
    return str(due)[:10]


def create_page(task: dict, assignee_notion_user_id=None) -> dict:
    """Tao page Notion cho task moi. Tra ve {synced, notionPageId, notionUrl}."""
    body = {"action": "create", "task": _task_payload(task, assignee_notion_user_id)}
    return _post(body)


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


def _post(body: dict) -> dict:
    """Gui POST toi gateway. Nuot moi loi -> {'synced': False} + log canh bao."""
    url = os.getenv(_GATEWAY_URL_ENV)
    secret = os.getenv(_SECRET_ENV)
    if not url or not secret:
        log.warning("Notion gateway chua cau hinh (thieu %s/%s), bo qua sync.",
                    _GATEWAY_URL_ENV, _SECRET_ENV)
        return {"synced": False}

    # Import lazy: neu chua cai 'requests' thi cung degrade nhe, khong vo import task_ops.
    try:
        import requests
    except ImportError:
        log.warning("Chua cai 'requests' (pip install requests), bo qua sync Notion.")
        return {"synced": False}

    try:
        resp = requests.post(
            url,
            json=body,
            headers={"x-sync-secret": secret},
            timeout=_TIMEOUT,
        )
        payload = resp.json()
        # Gateway luon tra JSON co 'synced'; chuan hoa ve dict an toan.
        return payload if isinstance(payload, dict) else {"synced": False}
    except Exception as e:  # timeout, DNS, HTTP loi, JSON hong... -> khong lam hong Firestore
        log.warning("Notion gateway loi: %s", str(e)[:200])
        return {"synced": False}
