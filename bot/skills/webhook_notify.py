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

# BAT BUOC: Cloudflare cua Discord CHAN request khong co User-Agent tu te (tra 403 "error
# code: 1010"). urllib mac dinh gui 'Python-urllib/3.x' -> bi chan, nen thong bao task moi
# lang le khong gui duoc. Web chay bang fetch (co UA trinh duyet) nen khong dinh. Dat UA
# theo dung format Discord khuyen nghi 'DiscordBot ($url, $version)'.
_USER_AGENT = "DiscordBot (https://m-plan.easygoing.vn, 1.0)"


def is_configured() -> bool:
    """Đã đặt DISCORD_WEBHOOK_URL hay chưa."""
    return bool((os.getenv(_URL_ENV) or "").strip())


def post(content: str = "", user_ids=None, embeds=None) -> bool:
    """Post 1 tin vào webhook, CHỈ ping các id trong user_ids. True nếu Discord trả 2xx.

    embeds: list embed Discord (thẻ đẹp có màu, tiêu đề bấm được…). Ping phải nằm ở
    content NGOÀI embed — mention trong embed không tạo thông báo.
    """
    url = (os.getenv(_URL_ENV) or "").strip()
    if not url:
        return False
    # allowed_mentions.parse=[] để '@everyone'/role trong text không vô tình ping cả kênh.
    users = [str(u) for u in (user_ids or []) if u]
    payload = {"content": content or "", "allowed_mentions": {"parse": [], "users": users}}
    if embeds:
        payload["embeds"] = embeds
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": _USER_AGENT},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return 200 <= resp.status < 300
    except Exception as e:
        log.warning("Gửi Discord webhook thất bại: %s", e)
        return False
