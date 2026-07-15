"""Tao embedding bang bge-m3 qua Ollama (HTTP). Mot viec: text -> vector 1024 chieu.

Dung `requests` (da co trong requirements) -> khong them dependency cho runtime bot.
Fail fast neu Ollama chua chay hoac model khong phai bge-m3 (sai so chieu).
Cau hinh qua env: OLLAMA_HOST, RAG_EMBED_MODEL, RAG_EMBED_TIMEOUT.
"""

import os

import requests

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
EMBED_MODEL = os.getenv("RAG_EMBED_MODEL", "bge-m3")
EMBED_DIM = 1024  # bge-m3 dense; doi model khac phai doi vector(N) trong migration
_TIMEOUT = int(os.getenv("RAG_EMBED_TIMEOUT", "60"))


class EmbeddingError(RuntimeError):
    """Loi khi goi Ollama that bai / tra ve khong hop le -> skill in 'LOI:' va thoat."""


def embed_text(text: str) -> list:
    """1 doan van -> vector 1024 chieu. Nem EmbeddingError neu that bai."""
    text = (text or "").strip()
    if not text:
        raise EmbeddingError("không thể embed chuỗi rỗng")

    try:
        resp = requests.post(
            f"{OLLAMA_HOST}/api/embeddings",
            json={"model": EMBED_MODEL, "prompt": text},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
    except requests.RequestException as e:
        raise EmbeddingError(
            f"gọi Ollama thất bại ở {OLLAMA_HOST} (Ollama đã chạy chưa? "
            f"'ollama pull {EMBED_MODEL}' chưa?): {e}"
        ) from e

    vec = resp.json().get("embedding")
    if not vec:
        raise EmbeddingError(f"Ollama không trả về embedding (kiểm tra model '{EMBED_MODEL}')")
    if len(vec) != EMBED_DIM:
        raise EmbeddingError(
            f"số chiều {len(vec)} != {EMBED_DIM}: model '{EMBED_MODEL}' không phải bge-m3, "
            f"hoặc phải đổi vector({len(vec)}) trong migration documents."
        )
    return vec


def embed_batch(texts: list) -> list:
    """Nhieu doan -> list vector. Goi tuan tu (Ollama xu ly 1 prompt/lan)."""
    return [embed_text(t) for t in texts]
