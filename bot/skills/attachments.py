"""Tao attachment tu URL cho task — ban Python cua web/src/lib/attachments.ts.

Phai giu DONG BO voi ban web: cung bo provider (quyet dinh icon tren task card) va
cung hinh dang {id, kind, url, name, provider}. Doi luat o mot ben thi doi ca hai.
"""

import re
import uuid
from urllib.parse import urlparse

_IMAGE_EXT = re.compile(r"\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?|#|$)")

# Khop tu tren xuong, lay provider dau tien trung — giu dung thu tu cua detectProvider().
_PROVIDER_HOSTS = (
    ("drive", ("drive.google", "docs.google")),
    ("discord", ("discord.com", "discord.gg", "discordapp")),
    ("notion", ("notion.so", "notion.site")),
    ("figma", ("figma.com",)),
    ("github", ("github.com",)),
    ("dropbox", ("dropbox.com",)),
    ("onedrive", ("1drv.ms", "onedrive.live")),
    ("youtube", ("youtube.com", "youtu.be")),
)


def is_http_url(url: str) -> bool:
    """Chan rac tu Claude: chi nhan http(s) that, khong nhan 'tai lieu abc'."""
    parsed = urlparse((url or "").strip())
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def detect_provider(url: str) -> str:
    """Doan provider tu URL -> quyet dinh icon hien tren task card."""
    lowered = url.lower()
    if _IMAGE_EXT.search(lowered):
        return "image"
    for provider, hosts in _PROVIDER_HOSTS:
        if any(host in lowered for host in hosts):
            return provider
    return "link"


def default_name(url: str) -> str:
    """Ten goi y khi nguoi dung khong dat ten: hostname, bo 'www.'."""
    host = urlparse(url).hostname or ""
    if host.startswith("www."):
        host = host[4:]
    return host or url[:40]


def make_link(url: str, name: str = "") -> dict:
    """Attachment kieu link/anh tu URL — khop makeLinkAttachment() ben web."""
    url = url.strip()
    provider = detect_provider(url)
    return {
        "id": str(uuid.uuid4()),
        "kind": "image" if provider == "image" else "link",
        "url": url,
        "name": (name or "").strip() or default_name(url),
        "provider": provider,
    }
