"""Kiem tra quyen cho cac skill — lop chan DUY NHAT khi bot ghi vao Postgres.

WHY: bot dung SUPABASE_SERVICE_ROLE_KEY nen BO QUA toan bo RLS. Moi rang buoc
ma web duoc Postgres bao ve deu vo hieu o day. Khong tu check thi bat ky ai tag
bot cung ghi duoc nhu admin (bot dang chay safe mode voi allowed_user_ids rong
-> ca server deu ra lenh duoc).

Luat (co y CHAT HON RLS):
- Tao task: ai cung duoc      -> khop policy tasks_insert.
- Moi lenh ghi khac:  admin   -> RLS cho ca reporter/assignee sua task, bot thi khong.
Fail closed: khong nhan dien duoc nguoi gui -> tu choi.

Danh tinh lay tu env BOT_SENDER_ID (bot.py dat tu message.author.id), KHONG lay
tu noi dung tin nhan -> khong the gia mao bang cach go "toi la admin".
"""

import os

import task_repo as repo
from constants import ROLE_ADMIN
from errors import PermissionDenied

# Hanh dong member duoc phep (de o day cho ro luat, tranh rai rac trong tung skill).
MEMBER_ACTIONS = ("tạo task",)


def current_user(client):
    """Profile cua nguoi dang tag bot. None neu chua link discord_id.

    Khop CHINH XAC theo discord_id — khong dung resolve_user() vi ham do se
    fallback sang doan theo displayName, khong duoc phep cho viec xet quyen.
    """
    sender = os.getenv("BOT_SENDER_ID", "").strip()
    if not sender:
        return None
    return repo.user_by_discord_id(client, sender)


def is_admin(client) -> bool:
    """True neu nguoi gui co profile va role = admin."""
    user = current_user(client)
    return bool(user and user.get("role") == ROLE_ADMIN)


def require_admin(client, action: str) -> dict:
    """Tra ve profile neu nguoi gui la admin, nguoc lai nem PermissionDenied.

    action: mo ta viec dinh lam ('tạo sprint', 'sửa task'...) — ghep vao cau
    tu choi de Claude thuat lai cho nguoi dung hieu tai sao.
    """
    user = current_user(client)
    if not user:
        raise PermissionDenied(
            f"không xác định được bạn là ai nên không thể {action}. "
            "Nhờ admin vào web > Thành viên điền Discord ID cho tài khoản của bạn."
        )
    if user.get("role") != ROLE_ADMIN:
        who = user.get("displayName") or "bạn"
        raise PermissionDenied(
            f"chỉ admin mới được {action} — {who} đang là member. "
            f"Member chỉ có thể nhờ bot {MEMBER_ACTIONS[0]}."
        )
    return user
