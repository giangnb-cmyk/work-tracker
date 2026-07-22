"""Khoi tao Supabase client (Singleton) dung service-role key.

Service-role BO QUA row level security -> moi kiem tra quyen phai lam trong code Python
(giong firebase-admin truoc day). Doc URL + key tu bien moi truong (fail fast neu thieu).
"""

import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from supabase import create_client, Client

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
        return _orig_send(self, request, **kwargs)


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
