"""Repository: tach truy cap Firestore ra khoi logic nghiep vu cua cac skill.

Dung chung cho task_ops.py, sprint_report.py, reminder.py. Moi ham 1 viec.
Chay standalone duoc: tu them thu muc bot/ vao sys.path de import firebase_client.
"""

import sys
from datetime import datetime, timezone
from pathlib import Path

# WHY: khi chay `python skills/xxx.py` thi bot/ khong nam tren sys.path -> them vao.
_BOT_DIR = Path(__file__).resolve().parent.parent
if str(_BOT_DIR) not in sys.path:
    sys.path.insert(0, str(_BOT_DIR))

from firebase_client import get_db  # noqa: E402  (phai sau khi vá sys.path)

from constants import STATUS_DONE  # noqa: E402

USERS = "users"
SPRINTS = "sprints"
TASKS = "tasks"


class ResolveError(Exception):
    """Loi nghiep vu khi khong phan giai duoc user/sprint -> in LOI: va thoat."""


def db():
    """Shortcut lay Firestore client Singleton."""
    return get_db()


# --- Users ---------------------------------------------------------------

def resolve_user(client, token: str):
    """Phan giai 1 nguoi tu: mention <@id>, discordId, uid, hoac displayName.

    Tra ve dict user (kem '_id') hoac None neu khong tim thay.
    """
    if not token:
        return None
    token = token.strip()
    # Mention Discord dang <@123> hoac <@!123> -> lay so.
    if token.startswith("<@") and token.endswith(">"):
        token = token.strip("<@!>").strip()

    # Thu theo discordId truoc (mention/so), roi uid, roi displayName.
    for field in ("discordId", "uid"):
        hit = _first_where(client, USERS, field, token)
        if hit:
            return hit

    doc = client.collection(USERS).document(token).get()
    if doc.exists:
        return {**doc.to_dict(), "_id": doc.id}

    return _match_display_name(client, token)


def _match_display_name(client, name: str):
    """Tim user theo displayName: uu tien khop chinh xac, roi khop mot phan (khong dau)."""
    from constants import _fold  # dung lai bo dau cua constants

    target = _fold(name)
    partial = None
    for doc in client.collection(USERS).stream():
        data = doc.to_dict()
        folded = _fold(data.get("displayName", ""))
        if folded == target:
            return {**data, "_id": doc.id}
        if partial is None and target and target in folded:
            partial = {**data, "_id": doc.id}
    return partial


def notion_user_id(client, assignee_id):
    """Lay notionUserId tu user doc de gateway set 'people' prop. None neu khong co."""
    if not assignee_id:
        return None
    doc = client.collection(USERS).document(assignee_id).get()
    return doc.to_dict().get("notionUserId") if doc.exists else None


def _first_where(client, collection: str, field: str, value):
    """Tra ve doc dau tien khop field==value (kem '_id'), hoac None."""
    query = client.collection(collection).where(field, "==", value).limit(1)
    for doc in query.stream():
        return {**doc.to_dict(), "_id": doc.id}
    return None


# --- Sprints -------------------------------------------------------------

def resolve_sprint(client, token: str):
    """Phan giai sprint tu 'active' hoac ten sprint.

    Tra ve dict sprint (kem '_id'). Nem ResolveError neu khong tim thay.
    'backlog' KHONG xu ly o day (caller tu hieu la sprintId=None).
    """
    token = (token or "active").strip()
    if token.lower() == "active":
        sprint = _first_where(client, SPRINTS, "status", "active")
        if not sprint:
            raise ResolveError("khong co sprint nao dang active")
        return sprint

    sprint = _match_sprint_name(client, token)
    if not sprint:
        raise ResolveError(f"khong tim thay sprint '{token}'")
    return sprint


def _match_sprint_name(client, name: str):
    """Khop ten sprint: chinh xac truoc, roi mot phan (khong phan biet hoa/thuong/dau)."""
    from constants import _fold

    exact = _first_where(client, SPRINTS, "name", name)
    if exact:
        return exact
    target = _fold(name)
    for doc in client.collection(SPRINTS).stream():
        data = doc.to_dict()
        if target and target in _fold(data.get("name", "")):
            return {**data, "_id": doc.id}
    return None


# --- Tasks ---------------------------------------------------------------

def get_task(client, task_id: str):
    """Lay 1 task theo id day du hoac id rut gon (8 ky tu dau). None neu khong co."""
    doc = client.collection(TASKS).document(task_id).get()
    if doc.exists:
        return {**doc.to_dict(), "_id": doc.id}
    # Cho phep id rut gon: quet tim doc bat dau bang chuoi da cho.
    for d in client.collection(TASKS).stream():
        if d.id.startswith(task_id):
            return {**d.to_dict(), "_id": d.id}
    return None


def query_tasks(client, sprint_id="__ANY__", assignee_id=None, status=None):
    """Lay danh sach task theo bo loc. sprint_id='__ANY__' = khong loc sprint.

    Loc theo sprint/assignee tren Firestore; loc status o phia client de tranh
    yeu cau composite index. Tra ve list dict (moi cai kem '_id').
    """
    query = client.collection(TASKS)
    if sprint_id != "__ANY__":
        query = query.where("sprintId", "==", sprint_id)
    if assignee_id:
        query = query.where("assigneeId", "==", assignee_id)

    results = []
    for doc in query.stream():
        data = {**doc.to_dict(), "_id": doc.id}
        if status and data.get("status") != status:
            continue
        results.append(data)
    return results


def overdue_and_due_today(client, now: datetime):
    """Tra ve (overdue, due_today): task chua done, co dueDate.

    overdue = dueDate < dau ngay hom nay; due_today = dueDate trong hom nay.
    """
    start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_today = start_today.replace(hour=23, minute=59, second=59)

    overdue, due_today = [], []
    for doc in client.collection(TASKS).stream():
        data = {**doc.to_dict(), "_id": doc.id}
        if data.get("status") == STATUS_DONE:
            continue
        due = data.get("dueDate")
        if not due:
            continue
        due_dt = _as_datetime(due)
        if due_dt < start_today:
            overdue.append(data)
        elif start_today <= due_dt <= end_today:
            due_today.append(data)
    return overdue, due_today


# --- Helpers -------------------------------------------------------------

def _as_datetime(value) -> datetime:
    """Ep Firestore Timestamp / datetime ve datetime tz-aware (UTC)."""
    dt = value if isinstance(value, datetime) else value.ToDatetime()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def short_id(task_id: str) -> str:
    """Id rut gon 8 ky tu dau cho de doc tren Discord."""
    return (task_id or "")[:8]


def next_order(client, sprint_id) -> int:
    """order hop ly = so task hien co trong sprint (them vao cuoi)."""
    return len(query_tasks(client, sprint_id=sprint_id))
