"""Skill CLI: kiem tra anh co bi COPY / DAO NHAI tren web khong (Google Vision Web Detection).

Member tag bot kem anh (HOAC reply 1 tin co anh roi tag bot) -> bot.py gom URL anh dua vao
prompt -> Claude goi script nay -> tra ve cac anh TRUNG (khop hoan toan / mot phan), trang web
dang chua anh, va anh TRONG GIONG. Claude doc ket qua roi TU DANH GIA "co dao nhai khong" va
gui link nghi van lai cho nguoi dung (day la buoc "AI check ki cang").

AI CUNG goi duoc (chi doc web, khong ghi DB) -> mo cho moi nguoi, giong doc search.

Xac thuc bang service account CHUNG voi ga4/drive (mac dinh keys/service-account-gsheets.json,
doi bang env GDRIVE_SERVICE_ACCOUNT). Project GCP cua SA phai BAT "Cloud Vision API".
Han muc: 1000 luot/thang mien phi (reset moi thang), sau do $3.50 / 1000 luot.

Vi du:
    python image_check.py --url "https://cdn.discordapp.com/attachments/.../a.png?ex=..."
    python image_check.py --url <url1> --url <url2>
"""

import argparse
import base64
import os
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")   # Windows console -> UTF-8 cho tieng Viet
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# Chay standalone (khong qua bot.py) van doc duoc GDRIVE_SERVICE_ACCOUNT trong .env.
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except Exception:
    pass

_REPO_DIR = Path(__file__).resolve().parent.parent.parent  # bot/skills/image_check.py -> goc repo
_DEFAULT_KEY = _REPO_DIR / "keys" / "service-account-gsheets.json"
_VISION_API = "https://vision.googleapis.com/v1/images:annotate"
_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]
_TIMEOUT = 30
_MAX_BYTES = 20 * 1024 * 1024   # Vision gioi han ~20MB/anh
_MAX_IMAGES = 5                 # tranh dot han muc free: moi lan check toi da 5 anh
_UA = "BotWorkTracker/1.0 (+https://m-plan.easygoing.vn)"


def die(message: str):
    """In loi ro rang (sentinel LOI: de Claude thuat lai) va thoat != 0. Fail fast."""
    print(f"LOI: {message}")
    sys.exit(1)


def _key_path() -> Path:
    return Path(os.getenv("GDRIVE_SERVICE_ACCOUNT") or str(_DEFAULT_KEY))


def _bearer_token() -> str:
    """Doc service account JSON -> access token (scope cloud-platform) cho Vision."""
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request
    except ImportError:
        die("thiếu thư viện google-auth. Cài: pip install -r bot/requirements.txt")
    path = _key_path()
    if not path.exists():
        die(f"không thấy service account key '{path}'. Đặt env GDRIVE_SERVICE_ACCOUNT hoặc để "
            "file ở keys/service-account-gsheets.json.")
    creds = service_account.Credentials.from_service_account_file(str(path), scopes=_SCOPES)
    creds.refresh(Request())
    return creds.token


def _download(url: str) -> bytes:
    """Tai bytes anh tu URL (thuong la Discord CDN). Loi -> die voi ly do ro."""
    import requests
    try:
        resp = requests.get(url, headers={"User-Agent": _UA}, timeout=_TIMEOUT)
    except Exception as e:
        die(f"tải ảnh thất bại (mạng): {str(e)[:150]}")
    if not resp.ok:
        die(f"tải ảnh HTTP {resp.status_code} — link ảnh có thể đã hết hạn. Gửi lại ảnh trực tiếp nhé.")
    data = resp.content
    if not data:
        die("ảnh tải về rỗng (0 byte).")
    if len(data) > _MAX_BYTES:
        die(f"ảnh {len(data) // (1024 * 1024)}MB vượt giới hạn 20MB của Vision — nén nhỏ lại rồi thử lại.")
    return data


def _web_detection(token: str, image_bytes: bytes, max_results: int) -> dict:
    """Goi Vision WEB_DETECTION cho 1 anh. Tra ve dict webDetection (rong neu khong co gi)."""
    import requests
    body = {
        "requests": [{
            "image": {"content": base64.b64encode(image_bytes).decode("ascii")},
            "features": [{"type": "WEB_DETECTION", "maxResults": max_results}],
        }]
    }
    try:
        resp = requests.post(
            _VISION_API,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=body,
            timeout=_TIMEOUT,
        )
    except Exception as e:
        die(f"gọi Vision thất bại (mạng): {str(e)[:150]}")
    if resp.status_code == 403:
        die("Vision từ chối (403): project GCP của service account CHƯA bật 'Cloud Vision API' "
            "(hoặc SA thiếu quyền). Vào Google Cloud Console > APIs & Services > Library > bật "
            "Cloud Vision API cho đúng project rồi thử lại.")
    if not resp.ok:
        die(f"Vision HTTP {resp.status_code} — {resp.text[:200]}")
    r0 = (resp.json().get("responses") or [{}])[0]
    if "error" in r0:
        die(f"Vision báo lỗi: {r0['error'].get('message', '')[:200]}")
    return r0.get("webDetection") or {}


def _urls(items, n):
    """Lay toi da n url khong rong tu list {url: ...} cua Vision."""
    return [it.get("url") for it in (items or [])[:n] if it.get("url")]


def _format(wd: dict, idx: int, total: int) -> str:
    """Bao cao 1 anh, Discord-friendly. Claude doc roi tu danh gia + gui link nghi van."""
    label = (wd.get("bestGuessLabels") or [{}])[0].get("label", "")
    full = wd.get("fullMatchingImages") or []
    partial = wd.get("partialMatchingImages") or []
    pages = wd.get("pagesWithMatchingImages") or []
    similar = wd.get("visuallySimilarImages") or []

    lines = [f"🖼️ Ảnh {idx}/{total}:" if total > 1 else "🖼️ Kết quả kiểm tra:"]
    if label:
        lines.append(f"• Google đoán nội dung ảnh: “{label}”")

    if full:
        lines.append(f"🔴 TRÙNG KHỚP HOÀN TOÀN ({len(full)}) — gần như chắc chắn là ảnh bị copy nguyên:")
        lines += [f"   • {u}" for u in _urls(full, 8)]
    if partial:
        lines.append(f"🟠 Trùng MỘT PHẦN / bị crop hoặc chỉnh sửa ({len(partial)}):")
        lines += [f"   • {u}" for u in _urls(partial, 8)]
    if pages:
        lines.append(f"📄 Trang web đang chứa ảnh này ({len(pages)}):")
        for p in pages[:8]:
            title = " ".join((p.get("pageTitle") or "").split())
            url = p.get("url")
            if url:
                lines.append(f"   • {title + ' — ' if title else ''}{url}")
    if similar:
        lines.append(f"🟡 Ảnh TRÔNG GIỐNG ({len(similar)}) — có thể trùng phong cách/bố cục, cần xem kỹ bằng mắt:")
        lines += [f"   • {u}" for u in _urls(similar, 6)]

    if not (full or partial or pages or similar):
        lines.append("✅ Không tìm thấy ảnh trùng hay giống nào trên web — nhiều khả năng AN TOÀN "
                     "(Vision chỉ soi được thứ Google đã index, nên không phải bảo chứng pháp lý).")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(
        description="Kiem tra anh co bi copy/dao nhai tren web (Google Vision Web Detection)."
    )
    ap.add_argument("--url", action="append", default=[],
                    help="URL anh can kiem tra (lap lai --url cho nhieu anh)")
    ap.add_argument("--max", type=int, default=15, help="So ket qua toi da moi loai (mac dinh 15)")
    args = ap.parse_args()

    urls = [u.strip() for u in args.url if u and u.strip()]
    if not urls:
        die("cần ít nhất một --url ảnh để kiểm tra.")
    dropped = len(urls) - _MAX_IMAGES if len(urls) > _MAX_IMAGES else 0
    urls = urls[:_MAX_IMAGES]

    token = _bearer_token()
    blocks = []
    for i, url in enumerate(urls, 1):
        wd = _web_detection(token, _download(url), args.max)
        blocks.append(_format(wd, i, len(urls)))
    if dropped:
        blocks.append(f"(Đã bỏ qua {dropped} ảnh để tiết kiệm hạn mức — gửi thêm lượt sau nếu cần.)")
    print("\n\n".join(blocks))


if __name__ == "__main__":
    main()
