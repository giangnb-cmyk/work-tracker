"""Khoi tao Supabase client (Singleton) dung service-role key.

Service-role BO QUA row level security -> moi kiem tra quyen phai lam trong code Python
(giong firebase-admin truoc day). Doc URL + key tu bien moi truong (fail fast neu thieu).
"""

import os

from supabase import create_client, Client

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
