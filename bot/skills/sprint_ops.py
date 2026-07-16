"""Skill CLI: tao / cap nhat / liet ke sprint (bang `sprints`).

Sprint la TOAN CUC — khong gan project (xem supabase/migrations/0001_init.sql).

Quyen: GHI can admin (khop RLS sprints_insert/update); liet ke thi ai cung xem duoc.
In ket qua de doc de Claude thuat lai; loi thi in 'LOI: ...' va thoat != 0.

Vi du:
    python sprint_ops.py create --name "Sprint 12" --goal "Xong đăng nhập" --start 2026-07-20 --end 2026-08-02
    python sprint_ops.py update --sprint "Sprint 12" --status "dang chay"
    python sprint_ops.py list
"""

import argparse
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows console -> UTF-8 cho tieng Viet
    sys.stderr.reconfigure(encoding="utf-8")  # log.warning cua gateway cung tieng Viet
except Exception:
    pass

import permissions
import task_repo as repo
from constants import SPRINT_ACTIVE, SPRINT_PLANNING, normalize_sprint_status, parse_ymd
from errors import PermissionDenied, ResolveError


def die(message: str):
    """In loi ro rang va thoat non-zero (fail fast, khong nuot loi)."""
    print(f"LOI: {message}")
    sys.exit(1)


def _parse_date(value: str, label: str):
    """'YYYY-MM-DD' -> datetime (fail fast neu sai dinh dang)."""
    if not value:
        return None
    try:
        return parse_ymd(value)
    except ValueError:
        die(f"{label} phải đúng định dạng YYYY-MM-DD, nhận được '{value}'")


def _normalize_status_or_die(value, default=None):
    """Chuan hoa sprint status; None -> default; khong nhan dien -> die."""
    if value is None:
        return default
    status = normalize_sprint_status(value)
    if status is None:
        die(f"status sprint không hợp lệ: '{value}' (dùng planning|active|completed)")
    return status


def _guard_single_active(client, status, force: bool, exclude_id=None):
    """Chan viec co 2 sprint active cung luc.

    WHY: khong co rang buoc DB nao ep dieu nay, ma resolve_sprint('active') va web
    deu chi lay CAI DAU TIEN -> hai sprint active se lam '--sprint active' thanh hen xui.
    Bot chan lai (chat hon web) tru khi admin noi ro --force.
    """
    if status != SPRINT_ACTIVE or force:
        return
    current = repo.active_sprint(client)
    if current and current["_id"] != exclude_id:
        die(
            f"'{current['name']}' đang là sprint active rồi. Đóng nó trước "
            f"(update --sprint \"{current['name']}\" --status xong), "
            "hoặc thêm --force nếu thật sự muốn hai sprint active cùng lúc."
        )


def cmd_create(args):
    client = repo.db()
    admin = permissions.require_admin(client, "tạo sprint")
    name = (args.name or "").strip()
    if not name:
        die("name bắt buộc")

    status = _normalize_status_or_die(args.status, SPRINT_PLANNING)
    _guard_single_active(client, status, args.force)

    sprint_id = repo.insert_sprint(client, {
        "name": name,
        "goal": args.goal or "",
        "status": status,
        "startDate": _parse_date(args.start, "start"),
        "endDate": _parse_date(args.end, "end"),
        "createdBy": admin["_id"],
    })
    print(f"Đã tạo sprint \"{name}\" (status {status}, id {sprint_id[:8]}).")


def cmd_update(args):
    client = repo.db()
    permissions.require_admin(client, "sửa sprint")
    sprint = repo.resolve_sprint(client, args.sprint)

    updates = _build_updates(args)
    if not updates:
        die("không có trường nào để cập nhật (dùng --name/--goal/--status/--start/--end)")
    _guard_single_active(client, updates.get("status"), args.force, exclude_id=sprint["_id"])
    repo.update_sprint(client, sprint["_id"], updates)

    changed = ", ".join(f"{k}={v}" for k, v in updates.items())
    print(f"Đã cập nhật sprint \"{sprint['name']}\": {changed}.")


def _build_updates(args) -> dict:
    """Gom cac truong duoc truyen thanh dict update (bo qua truong None)."""
    updates = {}
    if args.name is not None:
        name = args.name.strip()
        if not name:
            die("name không được để trống")
        updates["name"] = name
    if args.goal is not None:
        updates["goal"] = args.goal
    if args.status is not None:
        updates["status"] = _normalize_status_or_die(args.status)
    if args.start is not None:
        updates["startDate"] = _parse_date(args.start, "start")
    if args.end is not None:
        updates["endDate"] = _parse_date(args.end, "end")
    return updates


def cmd_list(args):
    client = repo.db()
    sprints = repo.list_sprints(client)
    if not sprints:
        print("Chưa có sprint nào.")
        return

    print(f"Có {len(sprints)} sprint:")
    for s in sprints:
        window = _window(s)
        goal = f" — {s['goal']}" if s.get("goal") else ""
        print(f"- [{s['_id'][:8]}] {s['name']} | {s.get('status', '?')}{window}{goal}")


def _window(sprint: dict) -> str:
    """Chuoi ' | start -> end' cho de doc; rong neu sprint khong co ngay."""
    start, end = (sprint.get("startDate") or "")[:10], (sprint.get("endDate") or "")[:10]
    if not start and not end:
        return ""
    return f" | {start or '?'} → {end or '?'}"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Tao/cap nhat/liet ke sprint (skill cho Discord bot).")
    sub = parser.add_subparsers(dest="command", required=True)

    c = sub.add_parser("create", help="Tao sprint moi (admin)")
    c.add_argument("--name", required=True, help="Ten sprint (bat buoc)")
    c.add_argument("--goal", help="Muc tieu sprint")
    c.add_argument("--status", help="planning|active|completed (nhan tieng Viet: chuan bi/dang chay/xong)")
    c.add_argument("--start", help="Ngay bat dau YYYY-MM-DD")
    c.add_argument("--end", help="Ngay ket thuc YYYY-MM-DD")
    c.add_argument("--force", action="store_true", help="Cho phep active thu hai (mac dinh chan)")
    c.set_defaults(func=cmd_create)

    u = sub.add_parser("update", help="Cap nhat sprint (admin)")
    u.add_argument("--sprint", required=True, help="Ten sprint | 'active'")
    u.add_argument("--name", help="Doi ten")
    u.add_argument("--goal", help="Doi muc tieu")
    u.add_argument("--status", help="Doi trang thai (planning|active|completed)")
    u.add_argument("--start", help="Doi ngay bat dau YYYY-MM-DD")
    u.add_argument("--end", help="Doi ngay ket thuc YYYY-MM-DD")
    u.add_argument("--force", action="store_true", help="Cho phep active thu hai (mac dinh chan)")
    u.set_defaults(func=cmd_update)

    l = sub.add_parser("list", help="Liet ke moi sprint")
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
