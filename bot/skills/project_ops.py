"""Skill CLI: tao / cap nhat / liet ke project (bang `projects`).

Project la cong vao cua ca app — moi view web deu loc theo project dang chon.
Project co the link toi 1 page trong Notion Projects-DB (projects.notion_project_id);
link do la thu task_ops.py dung de gan relation Project khi tao page Notion.

Quyen: GHI can admin (khop RLS projects_insert/update); liet ke thi ai cung xem duoc.
In ket qua de doc de Claude thuat lai; loi thi in 'LOI: ...' va thoat != 0.

Vi du:
    python project_ops.py create --name "Web Admin" --icon 🖥️ --notion "Web Admin"
    python project_ops.py update --project "Web Admin" --notion ""     # go link Notion
    python project_ops.py list
    python project_ops.py notion-list
"""

import argparse
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows console -> UTF-8 cho tieng Viet
    sys.stderr.reconfigure(encoding="utf-8")  # log.warning cua gateway cung tieng Viet
except Exception:
    pass

import notion_gateway
import permissions
import project_repo as repo
from constants import _fold
from errors import PermissionDenied, ResolveError


def die(message: str):
    """In loi ro rang va thoat non-zero (fail fast, khong nuot loi)."""
    print(f"LOI: {message}")
    sys.exit(1)


def _resolve_notion_project(token: str):
    """Ten/id project Notion -> id page. Token rong -> None (khong link / go link).

    Danh sach lay qua gateway (bot khong giu Notion token — xac thuc bang x-sync-secret).
    """
    if not token:
        return None
    if not notion_gateway.is_configured():
        die("chưa cấu hình Notion gateway (NOTION_GATEWAY_URL / NOTION_SYNC_SECRET) nên không link được")

    options = notion_gateway.list_projects()
    if not options:
        die("không lấy được danh sách project bên Notion (gateway lỗi hoặc Projects-DB trống)")

    by_id = [o for o in options if o.get("id") == token]
    if by_id:
        return by_id[0]["id"]

    target = _fold(token)
    exact = [o for o in options if _fold(o.get("name", "")) == target]
    if exact:
        return exact[0]["id"]

    partial = [o for o in options if target and target in _fold(o.get("name", ""))]
    if len(partial) > 1:
        found = ", ".join(f"'{o.get('name', '')}'" for o in partial)
        die(f"'{token}' khớp nhiều project Notion: {found} — nói rõ tên đầy đủ giúp tôi")
    if not partial:
        found = ", ".join(f"'{o.get('name', '')}'" for o in options)
        die(f"không tìm thấy project Notion '{token}'. Đang có: {found}")
    return partial[0]["id"]


def cmd_create(args):
    client = repo.db()
    admin = permissions.require_admin(client, "tạo project")
    name = (args.name or "").strip()
    if not name:
        die("name bắt buộc")

    notion_id = _resolve_notion_project(args.notion) if args.notion else None
    project_id = repo.insert_project(client, {
        "name": name,
        "icon": args.icon or "📁",
        "color": args.color or "#6366f1",
        "description": args.desc or "",
        "notionProjectId": notion_id,
        "createdBy": admin["_id"],
    })
    link = "đã link Notion" if notion_id else "chưa link Notion"
    print(f"Đã tạo project \"{name}\" ({link}, id {project_id[:8]}).")


def cmd_update(args):
    client = repo.db()
    permissions.require_admin(client, "sửa project")
    project = repo.resolve_project(client, args.project)

    updates = _build_updates(args)
    if not updates:
        die("không có trường nào để cập nhật (dùng --name/--icon/--color/--desc/--notion)")
    repo.update_project(client, project["_id"], updates)

    changed = ", ".join(f"{k}={v}" for k, v in updates.items())
    print(f"Đã cập nhật project \"{project['name']}\": {changed}.")


def _build_updates(args) -> dict:
    """Gom cac truong duoc truyen thanh dict update (bo qua truong None).

    --notion "" (chuoi rong) khac han voi khong truyen --notion: rong = GO link.
    """
    updates = {}
    if args.name is not None:
        name = args.name.strip()
        if not name:
            die("name không được để trống")
        updates["name"] = name
    if args.icon is not None:
        updates["icon"] = args.icon
    if args.color is not None:
        updates["color"] = args.color
    if args.desc is not None:
        updates["description"] = args.desc
    if args.notion is not None:
        updates["notionProjectId"] = _resolve_notion_project(args.notion)
    return updates


def cmd_list(args):
    client = repo.db()
    projects = repo.list_projects(client)
    if not projects:
        print("Chưa có project nào.")
        return

    print(f"Có {len(projects)} project:")
    for p in projects:
        link = "🔗 Notion" if p.get("notionProjectId") else "—"
        print(f"- [{p['_id'][:8]}] {p.get('icon', '')} {p['name']} | {link}")


def cmd_notion_list(args):
    """Liet ke project ben Notion de biet ten nao link duoc (admin)."""
    client = repo.db()
    permissions.require_admin(client, "xem danh sách project Notion")
    options = notion_gateway.list_projects()
    if not options:
        print("Không lấy được project Notion nào (chưa cấu hình gateway hoặc Projects-DB trống).")
        return

    print(f"Notion có {len(options)} project:")
    for o in options:
        print(f"- {o.get('name', '?')}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Tao/cap nhat/liet ke project (skill cho Discord bot).")
    sub = parser.add_subparsers(dest="command", required=True)

    c = sub.add_parser("create", help="Tao project moi (admin)")
    c.add_argument("--name", required=True, help="Ten project (bat buoc)")
    c.add_argument("--icon", help="Emoji (mac dinh 📁)")
    c.add_argument("--color", help="Ma mau hex (mac dinh #6366f1)")
    c.add_argument("--desc", help="Mo ta")
    c.add_argument("--notion", help="Ten hoac id project Notion de link (xem 'notion-list')")
    c.set_defaults(func=cmd_create)

    u = sub.add_parser("update", help="Cap nhat project (admin)")
    u.add_argument("--project", help="Ten hoac id project can sua")
    u.add_argument("--name", help="Doi ten")
    u.add_argument("--icon", help="Doi emoji")
    u.add_argument("--color", help="Doi mau hex")
    u.add_argument("--desc", help="Doi mo ta")
    u.add_argument("--notion", help="Link Notion moi; truyen chuoi rong '' de go link")
    u.set_defaults(func=cmd_update)

    l = sub.add_parser("list", help="Liet ke moi project")
    l.set_defaults(func=cmd_list)

    n = sub.add_parser("notion-list", help="Liet ke project ben Notion co the link (admin)")
    n.set_defaults(func=cmd_notion_list)
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
