"""Khoi tao Supabase client (Singleton) dung service-role key.

Service-role BO QUA row level security -> moi kiem tra quyen phai lam trong code Python
(giong firebase-admin truoc day). Doc URL + key tu bien moi truong (fail fast neu thieu).
"""

import os
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv
from supabase import create_client, Client

# ---------------------------------------------------------------------------
# Ép HTTP/1.1 cho MỌI httpx.Client của tiến trình (supabase-py mặc định bật HTTP/2).
# WHY: các vòng poll của bot chạy qua asyncio.to_thread và DÙNG CHUNG một client sync
# (Singleton) — hai thread cùng multiplex trên MỘT connection HTTP/2 là race state-machine
# h2: socket kẹt giữa chừng, nổ "[WinError 10035] A non-blocking socket operation could
# not be completed" (2026-07-25: release_sync + cost_export nổ cách nhau 5ms). HTTP/1.1
# thì pool phát mỗi thread một connection riêng — hết cửa race; còn keep-alive chết đã có
# _send_with_retry bên dưới lo. Không gì trong bot cần HTTP/2 (requests/aiohttp không đi
# qua httpx).
# ---------------------------------------------------------------------------
_orig_init = httpx.Client.__init__


def _init_http1(self, *args, **kwargs):
    kwargs["http2"] = False  # http2 là keyword-only trong httpx -> ghi đè kwargs là đủ
    _orig_init(self, *args, **kwargs)


httpx.Client.__init__ = _init_http1

# ---------------------------------------------------------------------------
# Vá lỗi socket keep-alive chết (httpx/HTTP2): bot poll 60s một nhịp, giữa hai nhịp
# connection trong pool bị server đóng vì rảnh; request kế tiếp tái dùng socket chết ->
# httpx.RemoteProtocolError/ReadError nổ ở _receive_response, traceback dài spam log
# ("Đẩy nhãn lên Discord lỗi" nhưng thật ra là cú GỌI SUPABASE chết ở tầng mạng).
#
# httpx tự loại connection hỏng khỏi pool sau lỗi, nên THỬ LẠI MỘT LẦN là ăn kết nối
# mới và chạy tiếp. Chỉ thử lại khi an toàn:
#   - GET/HEAD (select cua postgrest): idempotent, lặp thoải mái.
#   - Mọi method nếu là ConnectError: chưa gửi được gì tới server, lặp vô hại.
# KHÔNG thử lại POST/PATCH/DELETE chết giữa chừng — server có thể ĐÃ xử lý, lặp là
# double-insert. Các vòng poll tự chạy lại nhịp sau nên write hỏng không mất việc.
# Vá ở httpx.Client.send (một chỗ) thay vì rải retry khắp call site — bài học cũ:
# luật phải giữ thì chặn ở gốc, không nhắc từng nơi.
# ---------------------------------------------------------------------------
_orig_send = httpx.Client.send


def _send_with_retry(self, request, **kwargs):
    try:
        return _orig_send(self, request, **kwargs)
    except httpx.ConnectError:
        return _orig_send(self, request, **kwargs)  # chưa tới server — lặp an toàn
    except httpx.TransportError:
        if request.method not in ("GET", "HEAD"):
            raise
        # Toi da 2 lan thu lai co NGHI giua chung (0.25s/0.5s) thay vi mot lan lien tay:
        # WinError 10035 (socket ket non-blocking) can mot nhip de pool nha het connection
        # hong; thu lai ngay tung van dinh cung mot connection ket.
        for attempt in (1, 2):
            time.sleep(0.25 * attempt)
            try:
                return _orig_send(self, request, **kwargs)
            except httpx.TransportError:
                if attempt == 2:
                    raise


httpx.Client.send = _send_with_retry

# WHY: skill chay standalone (`python skills/task_ops.py ...`, run-*.bat) KHONG qua
# bot.py nen chua ai nap .env. Nap ngay tai noi duy nhat can 2 bien nay -> moi skill
# deu chay tay duoc. Khong override: env san co (bot.py truyen xuong) van thang.
load_dotenv(Path(__file__).resolve().parent / ".env")

_client: Client | None = None


def get_client() -> Client:
    """Tra ve Supabase client dung chung. Init 1 lan roi cache lai (Singleton)."""
    global _client
    if _client is not None:
        return _client

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "LOI: thieu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. "
            "Lay o Supabase Dashboard -> Project Settings -> API "
            "(service_role key la BI MAT, chi dung o bot/server, KHONG dua vao web)."
        )
    _client = create_client(url, key)
    return _client
