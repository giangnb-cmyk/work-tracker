"""Repository: tach truy cap Supabase ra khoi logic nghiep vu cua cac skill.

Dung chung cho task_ops.py, sprint_report.py, reminder.py. Moi ham 1 viec.
Tra ve dict theo KHOA camelCase (+ '_id') giong truoc day de skill khong phai sua nhieu.
Chay standalone duoc: tu them thu muc bot/ vao sys.path de import supabase_client.
"""

import sys
from datetime import datetime, timezone
from pathlib import Path

# WHY: khi chay `python skills/xxx.py` thi bot/ khong nam tren sys.path -> them vao.
_BOT_DIR = Path(__file__).resolve().parent.parent
if str(_BOT_DIR) not in sys.path:
    sys.path.insert(0, str(_BOT_DIR))

from supabase_client import get_client  # noqa: E402

from constants import STATUS_DONE  # noqa: E402
from errors import ResolveError  # noqa: E402,F401 — re-export: skill cu bat `repo.ResolveError`

USERS = "profiles"
SPRINTS = "sprints"
TASKS = "tasks"
ACTIVITY = "activity"


def db():
    """Shortcut lay Supabase client Singleton."""
    return get_client()


# --- Mappers: row Postgres (snake_case) -> dict skill (camelCase, + '_id') -------

def _map_user(r: dict) -> dict:
    return {
        "_id": r["id"],
        "uid": r["id"],
        "email": r.get("email", ""),
        "displayName": r.get("display_name", ""),
        "role": r.get("role"),
        "jobRole": r.get("job_role"),
        "discordId": r.get("discord_id"),
        "notionUserId": r.get("notion_user_id"),
    }


def _map_sprint(r: dict) -> dict:
    return {
        "_id": r["id"],
        "name": r.get("name", ""),
        "status": r.get("status"),
        "goal": r.get("goal", ""),
        "startDate": r.get("start_date"),
        "endDate": r.get("end_date"),
    }


def _map_task(r: dict) -> dict:
    return {
        "_id": r["id"],
        "id": r["id"],
        "title": r.get("title", ""),
        "description": r.get("description", ""),
        "sprintId": r.get("sprint_id"),
        "projectId": r.get("project_id"),
        "featureId": r.get("feature_id"),
        "status": r.get("status"),
        "priority": r.get("priority"),
        "assigneeId": r.get("assignee_id"),
        "assigneeName": r.get("assignee_name", ""),
        "reporterId": r.get("reporter_id"),
        "points": r.get("points", 0),
        "dueStart": r.get("due_start"),
        "dueDate": r.get("due_date"),
        "order": r.get("order", 0),
        "source": r.get("source"),
        "notionPageId": r.get("notion_page_id"),
        "notionUrl": r.get("notion_url"),
        # WHY: reminder._cc_discord_ids doc 'watcherIds' de cc nguoi lien quan vao
        # thong bao hoan thanh — thieu 2 khoa nay thi no am tham cc rong mai mai.
        "watcherIds": r.get("watcher_ids") or [],
        "watcherNames": r.get("watcher_names") or [],
        # WHY: task_ops gan THEM tai lieu -> phai doc duoc list cu, khong thi ghi de mat.
        "attachments": r.get("attachments") or [],
    }


# camelCase (skill) -> snake_case (column) for writes.
_TASK_COL = {
    "title": "title",
    "description": "description",
    "sprintId": "sprint_id",
    "projectId": "project_id",
    "featureId": "feature_id",
    "status": "status",
    "priority": "priority",
    "assigneeId": "assignee_id",
    "assigneeName": "assignee_name",
    "reporterId": "reporter_id",
    "points": "points",
    "tags": "tags",
    "order": "order",
    "source": "source",
    "notionPageId": "notion_page_id",
    "notionUrl": "notion_url",
    "watcherIds": "watcher_ids",
    "watcherNames": "watcher_names",
    "attachments": "attachments",
}


def _to_row(fields: dict) -> dict:
    """Ep dict camelCase -> row snake_case cho insert/update. Bo qua khoa server-managed."""
    row: dict = {}
    for k, v in fields.items():
        if k in ("id", "_id", "createdAt", "updatedAt"):
            continue
        if k == "dueDate":
            row["due_date"] = _iso(v)
        elif k == "dueStart":
            row["due_start"] = _iso(v)
        elif k in _TASK_COL:
            row[_TASK_COL[k]] = v
    return row


# --- Users ---------------------------------------------------------------

def resolve_user(client, token: str):
    """Phan giai 1 nguoi tu: mention <@id>, discordId, uid, hoac displayName."""
    if not token:
        return None
    token = token.strip()
    if token.startswith("<@") and token.endswith(">"):
        token = token.strip("<@!>").strip()

    hit = _first_where(client, USERS, "discord_id", token)
    if hit:
        return hit
    # uid = profiles.id (uuid); tra loi neu token khong phai uuid hop le -> bo qua.
    try:
        res = client.table(USERS).select("*").eq("id", token).limit(1).execute()
        if res.data:
            return _map_user(res.data[0])
    except Exception:
        pass
    return _match_display_name(client, token)


def _match_display_name(client, name: str):
    """Tim user theo displayName: uu tien khop chinh xac, roi khop mot phan (khong dau)."""
    from constants import _fold

    target = _fold(name)
    partial = None
    for r in client.table(USERS).select("*").execute().data:
        folded = _fold(r.get("display_name", ""))
        if folded == target:
            return _map_user(r)
        if partial is None and target and target in folded:
            partial = _map_user(r)
    return partial


def get_profile(client, uid):
    """Lay 1 profile theo id (uuid). None neu khong co."""
    if not uid:
        return None
    res = client.table(USERS).select("*").eq("id", uid).limit(1).execute()
    return _map_user(res.data[0]) if res.data else None


def sprint_name(client, sprint_id) -> str:
    """Ten sprint tu id; 'backlog' neu null; '?' neu khong tim thay."""
    if not sprint_id:
        return "backlog"
    res = client.table(SPRINTS).select("name").eq("id", sprint_id).limit(1).execute()
    return res.data[0]["name"] if res.data else "?"


def notion_user_id(client, assignee_id):
    """Lay notionUserId tu profile de gateway set 'people' prop. None neu khong co."""
    if not assignee_id:
        return None
    res = client.table(USERS).select("notion_user_id").eq("id", assignee_id).limit(1).execute()
    return res.data[0]["notion_user_id"] if res.data else None


def user_by_discord_id(client, discord_id):
    """Profile khop CHINH XAC discord_id. None neu chua ai link id do.

    WHY tach khoi resolve_user(): resolve_user fallback sang doan theo displayName,
    khong duoc phep cho viec xet quyen (permissions.py) hay gan reporter.
    """
    if not discord_id:
        return None
    return _first_where(client, USERS, "discord_id", str(discord_id).strip())


# Bang tra mapper theo ten bang. Them bang moi -> them 1 dong o day.
# WHY: truoc day dispatch bang chuoi if long nhau voi nhanh 'else' bat-tat, nen
# bang la se chui qua _map_task va tra ve dict rac ma khong bao loi.
_MAPPERS = {USERS: _map_user, SPRINTS: _map_sprint, TASKS: _map_task}


def _first_where(client, table: str, column: str, value):
    """Tra ve dict dau tien khop column==value, hoac None. KeyError neu bang chua co mapper."""
    res = client.table(table).select("*").eq(column, value).limit(1).execute()
    if not res.data:
        return None
    return _MAPPERS[table](res.data[0])


# --- Sprints -------------------------------------------------------------

def resolve_sprint(client, token: str):
    """Phan giai sprint tu 'active' hoac ten sprint. Nem ResolveError neu khong tim thay."""
    token = (token or "active").strip()
    if token.lower() == "active":
        sprint = active_sprint(client)
        if not sprint:
            raise ResolveError("không có sprint nào đang chạy (không tuần nào phủ hôm nay)")
        return sprint

    sprint = _match_sprint_name(client, token)
    if not sprint:
        raise ResolveError(f"không tìm thấy sprint '{token}'")
    return sprint


def _match_sprint_name(client, name: str):
    """Khop ten sprint: chinh xac truoc, roi mot phan (khong phan biet hoa/thuong/dau)."""
    from constants import _fold

    exact = _first_where(client, SPRINTS, "name", name)
    if exact:
        return exact
    target = _fold(name)
    for r in client.table(SPRINTS).select("*").execute().data:
        if target and target in _fold(r.get("name", "")):
            return _map_sprint(r)
    return None


def list_sprints(client) -> list:
    """Moi sprint, cu -> moi."""
    rows = client.table(SPRINTS).select("*").order("created_at").execute().data
    return [_map_sprint(r) for r in rows]


def active_sprint(client):
    """Sprint DANG CHAY = tuan chua hom nay (start_date <= now <= end_date), hoac None.

    Xet theo THOI GIAN chu khong theo cot status (giong web activeSprintAt) — sprint tuan
    tu tao bang pg_cron (0041) khong ai bam 'active' tay, moc ngay moi la su that. Nhieu
    sprint cung phu now (lo tao chong) -> lay cai bat dau muon nhat (tuan moi de tuan cu).
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    rows = (client.table(SPRINTS).select("*")
            .lte("start_date", now_iso).gte("end_date", now_iso)
            .order("start_date", desc=True).limit(1).execute().data)
    return _map_sprint(rows[0]) if rows else None


# camelCase (skill) -> snake_case (column) cho ghi sprint.
_SPRINT_COL = {"name": "name", "goal": "goal", "status": "status", "createdBy": "created_by"}


def _sprint_row(fields: dict) -> dict:
    """Ep dict camelCase -> row snake_case cho insert/update sprint."""
    row: dict = {}
    for k, v in fields.items():
        if k == "startDate":
            row["start_date"] = _iso(v)
        elif k == "endDate":
            row["end_date"] = _iso(v)
        elif k in _SPRINT_COL:
            row[_SPRINT_COL[k]] = v
    return row


def insert_sprint(client, fields: dict) -> str:
    """Chen sprint moi tu dict camelCase. Tra ve id (uuid) vua tao."""
    res = client.table(SPRINTS).insert(_sprint_row(fields)).execute()
    return res.data[0]["id"]


def update_sprint(client, sprint_id: str, fields: dict) -> None:
    """Cap nhat sprint theo id tu dict camelCase."""
    client.table(SPRINTS).update(_sprint_row(fields)).eq("id", sprint_id).execute()


# --- Tasks ---------------------------------------------------------------

def get_task(client, task_id: str):
    """Lay 1 task theo id day du hoac id rut gon. None neu khong co.

    Nhan ca dang nguoi dung copy tu web: '#71EC49'. WHY: TaskModal hien 6 ky tu VIET HOA
    (`id.slice(0,6).toUpperCase()`), con day so khop prefix — khong bo '#' va ha chu
    thuong thi id nguoi dung nhin thay tren man hinh lai bao 'không tìm thấy task'.
    Prefix trung nhieu task -> nem ResolveError chu KHONG lay dai: doan bua o day nghia
    la sua nham task cua nguoi khac.
    """
    key = (task_id or "").strip().lstrip("#").lower()
    if not key:
        return None
    try:
        res = client.table(TASKS).select("*").eq("id", key).limit(1).execute()
        if res.data:
            return _map_task(res.data[0])
    except Exception:
        pass  # khong phai uuid day du -> thu prefix ben duoi
    hits = [r for r in client.table(TASKS).select("*").execute().data
            if str(r["id"]).lower().startswith(key)]
    if len(hits) > 1:
        names = ", ".join(f"{r['id'][:8]} ({r.get('title', '')[:30]})" for r in hits[:4])
        raise ResolveError(f"id '{task_id}' khớp {len(hits)} task, cần id dài hơn: {names}")
    return _map_task(hits[0]) if hits else None


def query_tasks(client, sprint_id="__ANY__", assignee_id=None, status=None):
    """Lay danh sach task theo bo loc. sprint_id='__ANY__' = khong loc sprint."""
    q = client.table(TASKS).select("*")
    if sprint_id != "__ANY__":
        q = q.is_("sprint_id", "null") if sprint_id is None else q.eq("sprint_id", sprint_id)
    if assignee_id:
        q = q.eq("assignee_id", assignee_id)
    if status:
        q = q.eq("status", status)
    return [_map_task(r) for r in q.execute().data]


def overdue_and_due_today(client, now: datetime):
    """Tra ve (overdue, due_today): task chua done, co dueDate."""
    start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_today = start_today.replace(hour=23, minute=59, second=59)

    overdue, due_today = [], []
    for r in client.table(TASKS).select("*").neq("status", STATUS_DONE).execute().data:
        due = r.get("due_date")
        if not due:
            continue
        due_dt = _as_datetime(due)
        if due_dt < start_today:
            overdue.append(_map_task(r))
        elif start_today <= due_dt <= end_today:
            due_today.append(_map_task(r))
    return overdue, due_today


def open_assigned_tasks(client) -> list:
    """Task chua done VA da co assignee — nguon dem 'ton dong' theo nguoi (member_dm)."""
    rows = client.table(TASKS).select("*").neq("status", STATUS_DONE).execute().data
    return [_map_task(r) for r in rows if r.get("assignee_id")]


def done_task_ids_since(client, since_iso: str) -> set:
    """Id cac task duoc chuyen sang 'done' tu thoi diem `since_iso` (ISO, tz-aware).

    Dem qua bang `activity` (trigger tasks_log_status, migration 0007) — moc thoi gian
    la luc DOI TRANG THAI, khong phai tasks.updated_at (co the bi ghi de vi ly do khac).
    Chi co du lieu tu khi ap 0007; task done truoc do khong duoc tinh.
    """
    rows = (
        client.table(ACTIVITY).select("task_id")
        .eq("type", "status_change").eq("body", STATUS_DONE)
        .gte("created_at", since_iso).execute().data
    )
    return {r["task_id"] for r in rows}


def tasks_by_ids(client, ids) -> list:
    """Lay nhieu task theo danh sach id trong 1 query. Rong -> [] (khong query)."""
    if not ids:
        return []
    res = client.table(TASKS).select("*").in_("id", list(ids)).execute()
    return [_map_task(r) for r in res.data]


def insert_task(client, fields: dict) -> str:
    """Chen task moi tu dict camelCase. Tra ve id (uuid) vua tao."""
    res = client.table(TASKS).insert(_to_row(fields)).execute()
    return res.data[0]["id"]


def update_task(client, task_id: str, fields: dict) -> None:
    """Cap nhat task theo id tu dict camelCase (updated_at do trigger tu lo)."""
    client.table(TASKS).update(_to_row(fields)).eq("id", task_id).execute()


def delete_task(client, task_id: str, actor_id=None, actor_name: str = "") -> None:
    """Xoa task theo id (uuid day du). Quyen da gate o task_ops.cmd_delete.

    Goi RPC bot_delete_task (thay vi DELETE thang) de trigger audit ghi NGUOI YEU CAU
    (0049) — bot chay service_role nen neu xoa thang thi log chi hien 'Bot', mat dau ai nho.
    """
    client.rpc(
        "bot_delete_task",
        {"p_task_id": task_id, "p_actor_id": actor_id, "p_actor_name": actor_name or ""},
    ).execute()


def set_notion_link(client, task_id: str, page_id, url) -> None:
    """Ghi nguoc notionPageId/Url sau khi sync tao page."""
    client.table(TASKS).update({"notion_page_id": page_id, "notion_url": url}).eq("id", task_id).execute()


# --- Helpers -------------------------------------------------------------

def _as_datetime(value) -> datetime:
    """Ep ISO string / datetime ve datetime tz-aware (UTC)."""
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    else:
        dt = value.ToDatetime()  # phong khi con Firestore Timestamp
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _iso(value) -> str | None:
    """datetime -> ISO string cho cot timestamptz; None giu nguyen."""
    if not value:
        return None
    if isinstance(value, str):
        return value
    dt = value if isinstance(value, datetime) else None
    return dt.isoformat() if dt else None


def short_id(task_id: str) -> str:
    """Id rut gon 8 ky tu dau cho de doc tren Discord."""
    return (task_id or "")[:8]


def next_order(client, sprint_id) -> int:
    """order hop ly = so task hien co trong sprint (them vao cuoi)."""
    return len(query_tasks(client, sprint_id=sprint_id))
