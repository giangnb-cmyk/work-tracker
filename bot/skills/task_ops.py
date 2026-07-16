"""Skill CLI: tao / cap nhat / giao / liet ke task tren Supabase.

Claude goi script nay (che do an toan chi cho phep chay dung cac file skill).
In ket qua de doc de Claude thuat lai; loi thi in dong 'LOI: ...' va thoat != 0.

Quyen: tao task thi ai cung duoc (khop RLS tasks_insert); SUA task thi chi admin
(chat hon RLS mot cach co chu y) — xem permissions.py.

Vi du:
    python task_ops.py create --title "Fix login" --project "Web" --assignee "Nam" --watchers "Ánh, Thúy" --sprint active
    python task_ops.py update --id 3f9a1b2c --status "dang lam"
    python task_ops.py list --assignee me --sprint active
"""

import argparse
import sys
from datetime import datetime, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows console -> UTF-8 cho tieng Viet
    sys.stderr.reconfigure(encoding="utf-8")  # log.warning cua gateway cung tieng Viet
except Exception:
    pass

import notion_gateway
import permissions
import project_repo as projects
import task_repo as repo
from constants import (
    STATUS_TODO,
    STATUS_DONE,
    PRIORITY_MEDIUM,
    end_of_work_week,
    normalize_priority,
    normalize_status,
    parse_ymd,
)
from errors import PermissionDenied, ResolveError
from task_title import MAX_TITLE, clean_title, merge_desc

# Truong update lam thay doi Notion (status/assignee/priority/due) -> can day sang gateway.
_NOTION_TRIGGER_FIELDS = ("status", "assigneeId", "priority", "dueDate")


def die(message: str):
    """In loi ro rang va thoat non-zero (fail fast, khong nuot loi)."""
    print(f"LOI: {message}")
    sys.exit(1)


# --- Phan giai tham so dung chung -------------------------------------------

def _resolve_reporter(client):
    """reporterId = profile khop BOT_SENDER_ID, hoac None (reporter_id la uuid FK).

    Khop chinh xac theo discord_id — khong de resolve_user() doan theo ten, vi
    BOT_SENDER_ID la mot chuoi so, doan theo displayName chi ra ket qua bay ba.
    """
    user = permissions.current_user(client)
    return user["_id"] if user else None


def _resolve_sprint(client, token: str):
    """'backlog' -> None; nguoc lai tra ve dict sprint (nem ResolveError neu sai).

    Tra ve ca dict chu khong chi _id vi cmd_create con can endDate de dat han mac dinh.
    """
    if not token or token.strip().lower() == "backlog":
        return None
    return repo.resolve_sprint(client, token)


def _due_window(sprint, due_arg: str):
    """Tra ve (dueStart, dueDate) cho task moi.

    Thu tu uu tien: --due nguoi dung dua > cuoi sprint > cuoi tuan lam viec.
    Cuoi cung bam theo web (endOfWorkWeek) de task backlog/sprint khong ngay van co han.
    dueStart = bay gio, giong createTask ben web -> Timeline ve duoc thanh Gantt.
    """
    now = datetime.now(timezone.utc)
    explicit = _parse_due(due_arg)
    if explicit:
        return now, explicit, "bạn đặt"
    if sprint and sprint.get("endDate"):
        return now, repo._as_datetime(sprint["endDate"]), "cuối sprint"
    return now, end_of_work_week(now), "cuối tuần"


def _parse_due(due: str):
    """Chuyen 'YYYY-MM-DD' thanh datetime (fail fast neu sai dinh dang)."""
    if not due:
        return None
    try:
        return parse_ymd(due)
    except ValueError:
        die(f"due phải đúng định dạng YYYY-MM-DD, nhận được '{due}'")


def _assignee_fields(client, token: str):
    """Tra ve (assigneeId, assigneeName) tu ten/mention. None neu khong dua vao."""
    if not token:
        return None, ""
    user = repo.resolve_user(client, token)
    if not user:
        die(f"không tìm thấy người nhận '{token}' trong bảng users")
    return user["_id"], user.get("displayName", "")


def _watcher_fields(client, token: str):
    """'Nam, Ánh, <@123>' -> (watcherIds, watcherNames). Rong -> ([], []).

    Nguoi lien quan = duoc cc khi task hoan thanh (giong WatchersField ben web).
    Bo trung nhung giu thu tu; khong tim thay MOT nguoi la die -> khong am tham
    tao task thieu nguoi roi de nguoi dung tuong da gan du.
    """
    ids, names = [], []
    for raw in (token or "").split(","):
        name = raw.strip()
        if not name:
            continue
        user = repo.resolve_user(client, name)
        if not user:
            die(f"không tìm thấy người liên quan '{name}' trong danh sách thành viên")
        if user["_id"] in ids:
            continue  # go trung ten, hoac vua @mention vua go ten cung 1 nguoi
        ids.append(user["_id"])
        names.append(user.get("displayName", ""))
    return ids, names


# --- Subcommand: create ------------------------------------------------------

def cmd_create(args):
    """Tao task. Ai cung goi duoc — khop policy tasks_insert (khong can admin)."""
    client = repo.db()
    # Chan cuoi o phia code: hint chi la khuyen nghi, Claude van co the be nguyen mot
    # dong bang markdown lam tieu de (da tung xay ra — xem task_title.py).
    title, extra = clean_title(args.title)
    desc = merge_desc(args.desc, extra)
    if not title:
        die("title trống sau khi bỏ ký tự trang trí — cần một tiêu đề thật")
    if len(title) > MAX_TITLE:
        die(
            f"title dài {len(title)} ký tự, tối đa {MAX_TITLE}. Đặt tiêu đề ngắn gọn "
            f"(~40-70 ký tự) rồi đưa nguyên văn dài vào --desc."
        )

    priority = _normalize_or_die(normalize_priority, args.priority, "priority", PRIORITY_MEDIUM)
    # WHY: thieu projectId thi task thanh mo coi — moi view web (Bang Sprint, Backlog,
    # Features) deu loc theo project dang chon, task se khong hien o dau ca.
    project = projects.resolve_project(client, args.project)
    feature = projects.resolve_feature(client, project["_id"], args.feature) if args.feature else None
    sprint = _resolve_sprint(client, args.sprint)
    sprint_id = sprint["_id"] if sprint else None
    assignee_id, assignee_name = _assignee_fields(client, args.assignee)
    watcher_ids, watcher_names = _watcher_fields(client, args.watchers)
    due_start, due_dt, due_from = _due_window(sprint, args.due)

    task_doc = {
        "title": title,
        "description": desc,
        "sprintId": sprint_id,
        "projectId": project["_id"],
        "featureId": feature["_id"] if feature else None,
        "status": STATUS_TODO,
        "priority": priority,
        "assigneeId": assignee_id,
        "assigneeName": assignee_name,
        "reporterId": _resolve_reporter(client),
        "points": max(0, args.points),
        "tags": [],
        "dueStart": due_start,
        "dueDate": due_dt,
        "order": repo.next_order(client, sprint_id),
        "source": "discord",
        "watcherIds": watcher_ids,
        "watcherNames": watcher_names,
    }
    task_id = repo.insert_task(client, task_doc)  # Postgres la nguon su that -> ghi truoc, Notion sau

    where = "backlog" if sprint_id is None else args.sprint
    who = assignee_name or "chưa giao"
    feat = f", feature: {feature['name']}" if feature else ""
    watch = f", liên quan: {', '.join(watcher_names)}" if watcher_names else ""
    print(
        f"Đã tạo task [{repo.short_id(task_id)}] \"{title}\" "
        f"(status todo, priority {priority}, giao cho: {who}, "
        f"project: {project['name']}, sprint: {where}{feat}{watch}, "
        f"hạn: {due_dt:%d/%m} — {due_from})."
    )
    # Noi ra khi da tu sua tieu de, de nguoi dung biet ma kiem lai — dung im lang.
    if extra:
        print(f"Lưu ý: đầu vào là một dòng bảng; đã lấy ô đầu làm tiêu đề, phần còn lại ({extra}) đưa vào mô tả.")
    print(_sync_create(client, task_id, task_doc, assignee_id, project.get("notionProjectId")))


def _sync_create(client, task_id, task_doc, assignee_id, notion_project_id) -> str:
    """Tao page Notion sau khi ghi DB. Ghi nguoc notionPageId/Url neu thanh cong.

    Loi khong lam hong task da tao -> chi tra ve dong 'Notion: ...' de Claude thuat lai.
    """
    if not notion_gateway.is_configured():
        return "Notion: bỏ qua (chưa cấu hình)"
    notion_uid = repo.notion_user_id(client, assignee_id)
    # notion_project_id lay san tu row project -> khoi query lan hai.
    result = notion_gateway.create_page(task_doc, notion_uid, notion_project_id)
    if not result.get("synced"):
        return "Notion: bỏ qua (gọi gateway thất bại)"
    page_id = result.get("notionPageId")
    url = result.get("notionUrl") or ""
    repo.set_notion_link(client, task_id, page_id, url)
    return f"Notion: đã đồng bộ ({url})" if url else "Notion: đã đồng bộ"


# --- Subcommand: update ------------------------------------------------------

def cmd_update(args):
    """Sua task. CHI admin — chat hon RLS (web con cho reporter/assignee sua)."""
    client = repo.db()
    permissions.require_admin(client, "sửa task")
    task = repo.get_task(client, args.id)
    if not task:
        die(f"không tìm thấy task id '{args.id}'")

    updates = _build_updates(client, args)
    if not updates:
        die("không có trường nào để cập nhật (dùng --status/--priority/--title/...)")

    repo.update_task(client, task["_id"], updates)

    changed = ", ".join(
        f"{_FIELD_LABEL.get(k, k)}={_show(v)}"
        for k, v in updates.items()
        if k not in _HIDDEN_FIELDS
    )
    title = updates.get("title", task.get("title", ""))
    print(f"Đã cập nhật task [{repo.short_id(task['_id'])}] \"{title}\": {changed}.")
    print(_sync_update(client, task, updates))

    done_line = _notify_done_if_needed(task, updates)
    if done_line:
        print(done_line)


def _notify_done_if_needed(task, updates):
    """Neu update chuyen task sang 'done' (truoc do chua done) -> bao Discord.

    Tra ve dong relay, hoac None neu khong phai chuyen sang done. Best-effort:
    loi/thieu cau hinh chi log, khong lam hong lenh update Firestore.
    """
    if updates.get("status") != STATUS_DONE or task.get("status") == STATUS_DONE:
        return None
    # Import lazy: neu chua cai discord.py thi van khong vo lenh update.
    try:
        import reminder
    except ImportError:
        return "Discord: bỏ qua (chưa cài discord.py)"

    merged = {**task, **updates}  # phan anh title/assignee moi neu vua doi
    ok = reminder.notify_done(merged)
    return "Discord: đã báo hoàn thành" if ok else "Discord: bỏ qua (chưa cấu hình kênh)"


def _sync_update(client, task, updates) -> str:
    """Day cap nhat sang Notion neu task da lien ket va co truong lam Notion thay doi.

    Loi chi log (khong lam hong Firestore) -> tra ve dong 'Notion: ...' cho Claude.
    """
    page_id = task.get("notionPageId")
    if not page_id:
        return "Notion: bỏ qua (task chưa liên kết Notion)"
    if not any(field in updates for field in _NOTION_TRIGGER_FIELDS):
        return "Notion: bỏ qua (không đổi status/assignee/priority/due)"

    merged = {**task, **updates}  # gop truong moi len task cu de gui du du lieu
    notion_uid = repo.notion_user_id(client, merged.get("assigneeId"))
    result = notion_gateway.update_page(page_id, merged, notion_uid)
    return "Notion: đã đồng bộ" if result.get("synced") else "Notion: bỏ qua (gọi gateway thất bại)"


def _build_updates(client, args) -> dict:
    """Gom cac truong duoc truyen thanh dict update (bo qua truong None)."""
    updates = {}
    if args.status is not None:
        updates["status"] = _normalize_or_die(normalize_status, args.status, "status")
    if args.priority is not None:
        updates["priority"] = _normalize_or_die(normalize_priority, args.priority, "priority")
    if args.title is not None:
        # Cung bo lam sach nhu create: doi tieu de cung khong duoc phep nhet dong bang vao.
        title, _extra = clean_title(args.title)
        if not title:
            die("title trống sau khi bỏ ký tự trang trí — cần một tiêu đề thật")
        if len(title) > MAX_TITLE:
            die(f"title dài {len(title)} ký tự, tối đa {MAX_TITLE}. Đặt tiêu đề ngắn gọn hơn.")
        updates["title"] = title
    if args.points is not None:
        updates["points"] = max(0, args.points)
    if args.due is not None:
        updates["dueDate"] = _parse_due(args.due)
    if args.assignee is not None:
        assignee_id, assignee_name = _assignee_fields(client, args.assignee)
        updates["assigneeId"] = assignee_id
        updates["assigneeName"] = assignee_name
    if args.watchers is not None:
        # THAY THE ca danh sach (giong web); --watchers "" -> xoa het nguoi lien quan.
        watcher_ids, watcher_names = _watcher_fields(client, args.watchers)
        updates["watcherIds"] = watcher_ids
        updates["watcherNames"] = watcher_names
    return updates


# --- Subcommand: list --------------------------------------------------------

def _list_assignee_id(client, token):
    """None neu khong loc. 'me' -> map tu BOT_SENDER_ID."""
    if not token:
        return None
    if token.strip().lower() == "me":
        user = permissions.current_user(client)
        if not user:
            die("không xác định được 'me' (chưa liên kết Discord id với tài khoản)")
        return user["_id"]
    user = repo.resolve_user(client, token)
    if not user:
        die(f"không tìm thấy người '{token}'")
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
        print("Không có task nào khớp bộ lọc.")
        return

    tasks.sort(key=lambda t: (t.get("status", ""), t.get("order", 0)))
    print(f"Tìm thấy {len(tasks)} task:")
    for t in tasks:
        who = t.get("assigneeName") or "chưa giao"
        print(
            f"- [{repo.short_id(t['_id'])}] {t.get('title', '(không tên)')} "
            f"| {t.get('status', '?')} | {who} | {t.get('priority', '?')}"
        )


# --- Tien ich ----------------------------------------------------------------

def _normalize_or_die(fn, value, label, default=None):
    """Chuan hoa value qua fn; None value -> default; khong nhan dien -> die."""
    if value is None:
        return default
    result = fn(value)
    if result is None:
        die(f"{label} không hợp lệ: '{value}'")
    return result


# Doi ten truong khi in ket qua update cho de doc tren Discord.
_FIELD_LABEL = {"watcherNames": "liên quan", "assigneeName": "giao cho"}
# uuid noi bo — nguoi dung khong doc duoc, va da the hien qua truong '*Name' tuong ung.
_HIDDEN_FIELDS = ("watcherIds", "assigneeId")


def _show(value):
    """Hien thi gia tri update cho de doc (None -> 'trong', list -> noi bang dau phay)."""
    if value is None:
        return "trống"
    if isinstance(value, list):
        return ", ".join(str(v) for v in value) or "trống"
    return str(value)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Tao/cap nhat/liet ke task tren Supabase (skill cho Discord bot)."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    c = sub.add_parser("create", help="Tao task moi")
    c.add_argument("--title", required=True, help="Tieu de (bat buoc, 1-140 ky tu)")
    c.add_argument("--project", help="Ten hoac id project (bo trong neu chi co 1 project)")
    c.add_argument("--feature", help="Ten hoac id feature trong project (tuy chon)")
    c.add_argument("--assignee", help="Ten hoac mention nguoi nhan (khop users)")
    c.add_argument("--watchers", help="Nguoi lien quan, phan cach bang dau phay: 'Nam, Ánh, <@123>'")
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
    u.add_argument("--watchers", help="THAY THE danh sach nguoi lien quan; '' de xoa het")
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
    except (ResolveError, PermissionDenied) as e:
        die(str(e))
    except SystemExit:
        raise
    except Exception as e:  # loi ngoai y muon -> van in LOI ro rang
        die(f"lỗi không mong đợi: {e}")


if __name__ == "__main__":
    main()
