"""Skill CLI: tao / cap nhat / giao / liet ke task tren Firestore.

Claude goi script nay (che do an toan chi cho phep chay dung file nay).
In ket qua de doc de Claude thuat lai; loi thi in dong 'LOI: ...' va thoat != 0.

Vi du:
    python task_ops.py create --title "Fix login" --assignee "Nam" --sprint active --priority cao --points 3 --due 2026-07-20
    python task_ops.py update --id 3f9a1b2c --status "dang lam"
    python task_ops.py list --assignee me --sprint active
"""

import argparse
import os
import sys
from datetime import datetime

try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows console -> UTF-8 cho tieng Viet
except Exception:
    pass

from firebase_admin import firestore

import notion_gateway
import task_repo as repo
from constants import (
    STATUS_TODO,
    PRIORITY_MEDIUM,
    normalize_priority,
    normalize_status,
)

# Truong update lam thay doi Notion (status/assignee/priority/due) -> can day sang gateway.
_NOTION_TRIGGER_FIELDS = ("status", "assigneeId", "priority", "dueDate")


def die(message: str):
    """In loi ro rang va thoat non-zero (fail fast, khong nuot loi)."""
    print(f"LOI: {message}")
    sys.exit(1)


# --- Phan giai tham so dung chung -------------------------------------------

def _resolve_reporter(client):
    """reporterId = user khop BOT_SENDER_ID neu co, khong thi giu raw id / 'bot'."""
    sender = os.getenv("BOT_SENDER_ID", "").strip()
    if not sender:
        return "discord-bot"
    user = repo.resolve_user(client, sender)
    return user["_id"] if user else sender


def _resolve_sprint_id(client, token: str):
    """'backlog' -> None; nguoc lai phan giai sprint (nem ResolveError neu sai)."""
    if not token or token.strip().lower() == "backlog":
        return None
    return repo.resolve_sprint(client, token)["_id"]


def _parse_due(due: str):
    """Chuyen 'YYYY-MM-DD' thanh datetime (fail fast neu sai dinh dang)."""
    if not due:
        return None
    try:
        return datetime.strptime(due.strip(), "%Y-%m-%d")
    except ValueError:
        die(f"due phai dinh dang YYYY-MM-DD, nhan duoc '{due}'")


def _assignee_fields(client, token: str):
    """Tra ve (assigneeId, assigneeName) tu ten/mention. None neu khong dua vao."""
    if not token:
        return None, ""
    user = repo.resolve_user(client, token)
    if not user:
        die(f"khong tim thay nguoi nhan '{token}' trong collection users")
    return user["_id"], user.get("displayName", "")


# --- Subcommand: create ------------------------------------------------------

def cmd_create(args):
    client = repo.db()
    title = args.title.strip()
    if not (1 <= len(title) <= 140):
        die("title bat buoc, do dai 1-140 ky tu")

    priority = _normalize_or_die(normalize_priority, args.priority, "priority", PRIORITY_MEDIUM)
    sprint_id = _resolve_sprint_id(client, args.sprint)
    assignee_id, assignee_name = _assignee_fields(client, args.assignee)
    due_dt = _parse_due(args.due)

    doc_ref = client.collection(repo.TASKS).document()
    task_doc = {
        "id": doc_ref.id,
        "title": title,
        "description": args.desc or "",
        "sprintId": sprint_id,
        "status": STATUS_TODO,
        "priority": priority,
        "assigneeId": assignee_id,
        "assigneeName": assignee_name,
        "reporterId": _resolve_reporter(client),
        "points": max(0, args.points),
        "tags": [],
        "dueDate": due_dt,
        "order": repo.next_order(client, sprint_id),
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
        "source": "discord",
        "notionPageId": None,  # chua sync; se ghi lai neu gateway tra ve
        "notionUrl": None,
    }
    doc_ref.set(task_doc)  # Firestore la nguon su that -> ghi truoc, Notion sau

    where = "backlog" if sprint_id is None else args.sprint
    who = assignee_name or "chua giao"
    print(
        f"Da tao task [{repo.short_id(doc_ref.id)}] \"{title}\" "
        f"(status todo, priority {priority}, giao cho: {who}, sprint: {where})."
    )
    print(_sync_create(client, doc_ref, task_doc, assignee_id))


def _sync_create(client, doc_ref, task_doc, assignee_id) -> str:
    """Tao page Notion sau khi ghi Firestore. Ghi nguoc notionPageId/Url neu thanh cong.

    Loi khong lam hong task da tao -> chi tra ve dong 'Notion: ...' de Claude thuat lai.
    """
    if not notion_gateway.is_configured():
        return "Notion: skipped (chua cau hinh)"
    notion_uid = repo.notion_user_id(client, assignee_id)
    result = notion_gateway.create_page(task_doc, notion_uid)
    if not result.get("synced"):
        return "Notion: skipped (goi gateway that bai)"
    page_id = result.get("notionPageId")
    url = result.get("notionUrl") or ""
    doc_ref.update({"notionPageId": page_id, "notionUrl": url})
    return f"Notion: synced ({url})" if url else "Notion: synced"


# --- Subcommand: update ------------------------------------------------------

def cmd_update(args):
    client = repo.db()
    task = repo.get_task(client, args.id)
    if not task:
        die(f"khong tim thay task id '{args.id}'")

    updates = _build_updates(client, args)
    if not updates:
        die("khong co truong nao de cap nhat (dung --status/--priority/--title/...)")

    updates["updatedAt"] = firestore.SERVER_TIMESTAMP
    client.collection(repo.TASKS).document(task["_id"]).update(updates)

    changed = ", ".join(f"{k}={_show(v)}" for k, v in updates.items() if k != "updatedAt")
    title = updates.get("title", task.get("title", ""))
    print(f"Da cap nhat task [{repo.short_id(task['_id'])}] \"{title}\": {changed}.")
    print(_sync_update(client, task, updates))


def _sync_update(client, task, updates) -> str:
    """Day cap nhat sang Notion neu task da lien ket va co truong lam Notion thay doi.

    Loi chi log (khong lam hong Firestore) -> tra ve dong 'Notion: ...' cho Claude.
    """
    page_id = task.get("notionPageId")
    if not page_id:
        return "Notion: skipped (task chua lien ket Notion)"
    if not any(field in updates for field in _NOTION_TRIGGER_FIELDS):
        return "Notion: skipped (khong doi status/assignee/priority/due)"

    merged = {**task, **updates}  # gop truong moi len task cu de gui du du lieu
    notion_uid = repo.notion_user_id(client, merged.get("assigneeId"))
    result = notion_gateway.update_page(page_id, merged, notion_uid)
    return "Notion: synced" if result.get("synced") else "Notion: skipped (goi gateway that bai)"


def _build_updates(client, args) -> dict:
    """Gom cac truong duoc truyen thanh dict update (bo qua truong None)."""
    updates = {}
    if args.status is not None:
        updates["status"] = _normalize_or_die(normalize_status, args.status, "status")
    if args.priority is not None:
        updates["priority"] = _normalize_or_die(normalize_priority, args.priority, "priority")
    if args.title is not None:
        title = args.title.strip()
        if not (1 <= len(title) <= 140):
            die("title do dai 1-140 ky tu")
        updates["title"] = title
    if args.points is not None:
        updates["points"] = max(0, args.points)
    if args.due is not None:
        updates["dueDate"] = _parse_due(args.due)
    if args.assignee is not None:
        assignee_id, assignee_name = _assignee_fields(client, args.assignee)
        updates["assigneeId"] = assignee_id
        updates["assigneeName"] = assignee_name
    return updates


# --- Subcommand: list --------------------------------------------------------

def _list_assignee_id(client, token):
    """None neu khong loc. 'me' -> map tu BOT_SENDER_ID."""
    if not token:
        return None
    if token.strip().lower() == "me":
        sender = os.getenv("BOT_SENDER_ID", "").strip()
        user = repo.resolve_user(client, sender) if sender else None
        if not user:
            die("khong xac dinh duoc 'me' (chua lien ket Discord id voi tai khoan)")
        return user["_id"]
    user = repo.resolve_user(client, token)
    if not user:
        die(f"khong tim thay nguoi '{token}'")
    return user["_id"]


def _list_sprint_id(client, token):
    """Tra ve sentinel '__ANY__' khi khong loc; None cho backlog; id cho sprint."""
    if not token:
        return "__ANY__"
    if token.strip().lower() == "backlog":
        return None
    return repo.resolve_sprint(client, token)["_id"]


def cmd_list(args):
    client = repo.db()
    assignee_id = _list_assignee_id(client, args.assignee)
    sprint_filter = _list_sprint_id(client, args.sprint)
    status = _normalize_or_die(normalize_status, args.status, "status") if args.status else None

    tasks = repo.query_tasks(
        client, sprint_id=sprint_filter, assignee_id=assignee_id, status=status
    )
    if not tasks:
        print("Khong co task nao khop bo loc.")
        return

    tasks.sort(key=lambda t: (t.get("status", ""), t.get("order", 0)))
    print(f"Tim thay {len(tasks)} task:")
    for t in tasks:
        who = t.get("assigneeName") or "chua giao"
        print(
            f"- [{repo.short_id(t['_id'])}] {t.get('title', '(khong ten)')} "
            f"| {t.get('status', '?')} | {who} | {t.get('priority', '?')}"
        )


# --- Tien ich ----------------------------------------------------------------

def _normalize_or_die(fn, value, label, default=None):
    """Chuan hoa value qua fn; None value -> default; khong nhan dien -> die."""
    if value is None:
        return default
    result = fn(value)
    if result is None:
        die(f"{label} khong hop le: '{value}'")
    return result


def _show(value):
    """Hien thi gia tri update cho de doc (SERVER_TIMESTAMP an di, None -> 'trong')."""
    if value is None:
        return "trong"
    return str(value)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Tao/cap nhat/liet ke task tren Firestore (skill cho Discord bot)."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    c = sub.add_parser("create", help="Tao task moi")
    c.add_argument("--title", required=True, help="Tieu de (bat buoc, 1-140 ky tu)")
    c.add_argument("--assignee", help="Ten hoac mention nguoi nhan (khop users)")
    c.add_argument("--sprint", default="active", help="Ten sprint | 'active' | 'backlog'")
    c.add_argument("--priority", help="low|medium|high|urgent (nhan ca tieng Viet)")
    c.add_argument("--points", type=int, default=0, help="Story points")
    c.add_argument("--due", help="Han chot YYYY-MM-DD")
    c.add_argument("--desc", help="Mo ta")
    c.set_defaults(func=cmd_create)

    u = sub.add_parser("update", help="Cap nhat task theo id")
    u.add_argument("--id", required=True, help="Task id (day du hoac 8 ky tu dau)")
    u.add_argument("--status", help="todo|in_progress|review|done (nhan tieng Viet)")
    u.add_argument("--priority", help="low|medium|high|urgent")
    u.add_argument("--title", help="Doi tieu de")
    u.add_argument("--assignee", help="Giao lai cho nguoi khac")
    u.add_argument("--points", type=int, help="Story points")
    u.add_argument("--due", help="Han chot YYYY-MM-DD (de trong '' de xoa han)")
    u.set_defaults(func=cmd_update)

    l = sub.add_parser("list", help="Liet ke task")
    l.add_argument("--assignee", help="Ten nguoi | 'me'")
    l.add_argument("--sprint", help="Ten sprint | 'active' | 'backlog'")
    l.add_argument("--status", help="Loc theo trang thai")
    l.set_defaults(func=cmd_list)
    return parser


def main():
    args = build_parser().parse_args()
    try:
        args.func(args)
    except repo.ResolveError as e:
        die(str(e))
    except SystemExit:
        raise
    except Exception as e:  # loi ngoai y muon -> van in LOI ro rang
        die(f"loi khong mong doi: {e}")


if __name__ == "__main__":
    main()
