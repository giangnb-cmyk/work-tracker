"""Khoi tao firebase-admin dang Singleton va cung cap Firestore client.

Admin SDK BO QUA security rules -> moi kiem tra quyen phai lam trong code Python.
Doc duong dan service-account key tu bien moi truong (fail fast neu thieu file).
"""

import os
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

# Cache client sau lan khoi tao dau -> tranh init lai nhieu lan (Singleton).
_db = None


def _resolve_key_path() -> Path:
    """Tim duong dan service-account key theo thu tu uu tien.

    GOOGLE_APPLICATION_CREDENTIALS -> SERVICE_ACCOUNT_KEY -> ./serviceAccountKey.json
    (tuong doi voi thu muc bot/, khong phai cwd cua tien trinh goi).
    """
    raw = (
        os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        or os.getenv("SERVICE_ACCOUNT_KEY")
        or "./serviceAccountKey.json"
    )
    path = Path(raw)
    if not path.is_absolute():
        # Neo vao thu muc bot/ de chay duoc du cwd la dau (Claude chay tu WORKSPACE).
        path = (Path(__file__).parent / raw).resolve()
    return path


def get_db():
    """Tra ve Firestore client dung chung. Init 1 lan roi cache lai.

    Fail fast: neu khong tim thay key thi bao loi ro rang chu khong im lang.
    """
    global _db
    if _db is not None:
        return _db

    if not firebase_admin._apps:
        key_path = _resolve_key_path()
        if not key_path.exists():
            raise FileNotFoundError(
                f"LOI: khong tim thay service-account key tai '{key_path}'. "
                "Tai key o Firebase Console -> Project Settings -> Service Accounts "
                "-> Generate new private key, luu vao bot/serviceAccountKey.json "
                "hoac dat bien GOOGLE_APPLICATION_CREDENTIALS."
            )
        cred = credentials.Certificate(str(key_path))
        firebase_admin.initialize_app(cred)

    _db = firestore.client()
    return _db
