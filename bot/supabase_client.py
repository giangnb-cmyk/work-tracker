"""Khoi tao Supabase client (Singleton) dung service-role key.

Service-role BO QUA row level security -> moi kiem tra quyen phai lam trong code Python
(giong firebase-admin truoc day). Doc URL + key tu bien moi truong (fail fast neu thieu).
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client, Client

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
