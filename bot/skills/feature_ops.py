"""Skill CLI: tao / cap nhat / liet ke feature (bang `features`).

Feature la don vi cong viec san pham trong 1 project; task gan vao qua tasks.feature_id.

Quyen: GHI can admin (khop RLS features_write); liet ke thi ai cung xem duoc.
In ket qua de doc de Claude thuat lai; loi thi in 'LOI: ...' va thoat != 0.

Vi du:
    python feature_ops.py create --project "Web" --name "Đăng nhập Google" --icon 🔑
    python feature_ops.py update --project "Web" --feature "Đăng nhập" --desc "Gộp SSO"
    python feature_ops.py list --project "Web"
"""

import argparse
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows console -> UTF-8 cho tieng Viet
    sys.stderr.reconfigure(encoding="utf-8")  # log.warning cua gateway cung tieng Viet
except Exception:
    pass

import permissions
import project_repo as repo
from errors import PermissionDenied, ResolveError


def die(message: str):
    """In loi ro rang va thoat non-zero (fail fast, khong nuot loi)."""
    print(f"LOI: {message}")
    sys.exit(1)


def _check_name(name: str) -> str:
    """Ten feature: 1-120 ky tu (khop rang buoc CHECK cua Postgres -> fail som cho de hieu)."""
    name = (name or "").strip()
    if not (1 <= len(name) <= 120):
        die("name bắt buộc, độ dài 1-120 ký tự")
    return name


def cmd_create(args):
    client = repo.db()
    admin = permissions.require_admin(client, "tạo feature")
    name = _check_name(args.name)
    project = repo.resolve_project(client, args.project)

    feature_id = repo.insert_feature(client, {
        "projectId": project["_id"],
        "name": name,
        "icon": args.icon or "🧩",
        "color": args.color or "#6366f1",
        "description": args.desc or "",
        "createdBy": admin["_id"],
    })
    print(f"Đã tạo feature \"{name}\" trong project {project['name']} (id {feature_id[:8]}).")


def cmd_update(args):
    client = repo.db()
    permissions.require_admin(client, "sửa feature")
    project = repo.resolve_project(client, args.project)
    feature = repo.resolve_feature(client, project["_id"], args.feature)

    updates = _build_updates(args)
    if not updates:
        die("không có trường nào để cập nhật (dùng --name/--icon/--color/--desc)")
    repo.update_feature(client, feature["_id"], updates)

    changed = ", ".join(f"{k}={v}" for k, v in updates.items())
    print(f"Đã cập nhật feature \"{feature['name']}\" (project {project['name']}): {changed}.")


def _build_updates(args) -> dict:
    """Gom cac truong duoc truyen thanh dict update (bo qua truong None)."""
    updates = {}
    if args.name is not None:
        updates["name"] = _check_name(args.name)
    if args.icon is not None:
        updates["icon"] = args.icon
    if args.color is not None:
        updates["color"] = args.color
    if args.desc is not None:
        updates["description"] = args.desc
    return updates


def cmd_list(args):
    client = repo.db()
    project = repo.resolve_project(client, args.project)
    features = repo.list_features(client, project["_id"])
    if not features:
        print(f"Project {project['name']} chưa có feature nào.")
        return

    print(f"Project {project['name']} có {len(features)} feature:")
    for f in features:
        desc = f" — {f['description']}" if f.get("description") else ""
        print(f"- [{f['_id'][:8]}] {f.get('icon', '')} {f['name']}{desc}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Tao/cap nhat/liet ke feature (skill cho Discord bot).")
    sub = parser.add_subparsers(dest="command", required=True)

    c = sub.add_parser("create", help="Tao feature moi (admin)")
    c.add_argument("--project", help="Ten hoac id project (bo trong neu chi co 1 project)")
    c.add_argument("--name", required=True, help="Ten feature (bat buoc, 1-120 ky tu)")
    c.add_argument("--icon", help="Emoji (mac dinh 🧩)")
    c.add_argument("--color", help="Ma mau hex (mac dinh #6366f1)")
    c.add_argument("--desc", help="Mo ta")
    c.set_defaults(func=cmd_create)

    u = sub.add_parser("update", help="Cap nhat feature (admin)")
    u.add_argument("--project", help="Ten hoac id project")
    u.add_argument("--feature", required=True, help="Ten hoac id feature can sua")
    u.add_argument("--name", help="Doi ten")
    u.add_argument("--icon", help="Doi emoji")
    u.add_argument("--color", help="Doi mau hex")
    u.add_argument("--desc", help="Doi mo ta")
    u.set_defaults(func=cmd_update)

    l = sub.add_parser("list", help="Liet ke feature cua 1 project")
    l.add_argument("--project", help="Ten hoac id project")
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
