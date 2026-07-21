"""Gửi thông báo qua Discord webhook (không cần bot token). Best-effort.

WHY webhook chứ không dùng bot token như reminder.py: người dùng muốn báo 'task mới' qua
webhook (một kênh cố định), và post thẳng ở đây cho bot TỰ CHỨA — khỏi phụ thuộc gateway
web + secret trên Vercel. Thiếu DISCORD_WEBHOOK_URL thì bỏ qua im lặng, không bao giờ làm
hỏng thao tác gọi nó.
"""

import json
import logging
import os
import urllib.request

log = logging.getLogger("webhook_notify")

_URL_ENV = "DISCORD_WEBHOOK_URL"


def is_configured() -> bool:
    """Đã đặt DISCORD_WEBHOOK_URL hay chưa."""
    return bool((os.getenv(_URL_ENV) or "").strip())


def post(content: str, user_ids=None) -> bool:
    """Post 1 tin vào webhook, CHỈ ping các id trong user_ids. True nếu Discord trả 2xx."""
    url = (os.getenv(_URL_ENV) or "").strip()
    if not url:
        return False
    # allowed_mentions.parse=[] để '@everyone'/role trong text không vô tình ping cả kênh.
    users = [str(u) for u in (user_ids or []) if u]
    payload = {"content": content, "allowed_mentions": {"parse": [], "users": users}}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return 200 <= resp.status < 300
    except Exception as e:
        log.warning("Gửi Discord webhook thất bại: %s", e)
        return False
