"""Tien ich: dat role=admin cho thanh vien theo email (dung Admin SDK -> bo qua rules).

Dung khi can tao admin dau tien (khong the tu phong qua web vi rules chan).
Chay:  python bot/set_admin.py giangnb@easygoing.vn janreng.it@gmail.com
Bo --admin de ha ve member:  python bot/set_admin.py --role member <email>

Can co service-account key (bot/serviceAccountKey.json) - xem firebase_client.py.
"""

import argparse
import sys

from firebase_client import get_db


def set_role_by_email(db, email: str, role: str) -> int:
    """Cap nhat role cho tat ca user doc co email trung. Tra ve so doc da sua."""
    email = email.strip().lower()
    # email luu duoi dang thuong; query khop chinh xac.
    docs = list(db.collection("users").where("email", "==", email).stream())
    if not docs:
        print(f"  KHONG THAY user voi email '{email}' (ho da dang nhap web lan nao chua?)")
        return 0
    for doc in docs:
        doc.reference.update({"role": role})
        print(f"  OK: {email} -> role={role} (doc {doc.id})")
    return len(docs)


def main() -> int:
    parser = argparse.ArgumentParser(description="Dat quyen admin/member cho thanh vien theo email.")
    parser.add_argument("emails", nargs="+", help="Danh sach email can doi quyen")
    parser.add_argument("--role", choices=["admin", "member"], default="admin", help="Quyen muon dat (mac dinh admin)")
    args = parser.parse_args()

    try:
        db = get_db()
    except FileNotFoundError as e:
        print(str(e))
        return 1

    total = 0
    for email in args.emails:
        total += set_role_by_email(db, email, args.role)
    print(f"\nHoan tat: da cap nhat {total} thanh vien -> {args.role}.")
    return 0 if total > 0 else 2


if __name__ == "__main__":
    sys.exit(main())
