"""Tien ich: dat role=admin cho thanh vien theo email (dung service-role -> bo qua RLS).

Dung khi can tao admin dau tien (khong the tu phong qua web vi RLS chan).
Chay:  python bot/set_admin.py giangnb@easygoing.vn janreng.it@gmail.com
Ha ve member:  python bot/set_admin.py --role member <email>

Can SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY trong moi truong - xem supabase_client.py.
"""

import argparse
import sys

from supabase_client import get_client


def set_role_by_email(client, email: str, role: str) -> int:
    """Cap nhat role cho moi profile co email trung. Tra ve so dong da sua."""
    email = email.strip().lower()
    res = client.table("profiles").update({"role": role}).eq("email", email).execute()
    rows = res.data or []
    if not rows:
        print(f"  KHONG THAY profile voi email '{email}' (ho da dang nhap web lan nao chua?)")
        return 0
    for r in rows:
        print(f"  OK: {email} -> role={role} (id {r['id']})")
    return len(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Dat quyen admin/member cho thanh vien theo email.")
    parser.add_argument("emails", nargs="+", help="Danh sach email can doi quyen")
    parser.add_argument("--role", choices=["admin", "member"], default="admin", help="Quyen muon dat (mac dinh admin)")
    args = parser.parse_args()

    try:
        client = get_client()
    except RuntimeError as e:
        print(str(e))
        return 1

    total = 0
    for email in args.emails:
        total += set_role_by_email(client, email, args.role)
    print(f"\nHoan tat: da cap nhat {total} thanh vien -> {args.role}.")
    return 0 if total > 0 else 2


if __name__ == "__main__":
    sys.exit(main())
