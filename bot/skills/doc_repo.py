"""Repository: tach truy cap Supabase cho bang `documents` ra khoi logic skill.

Giong task_repo.py: tu them bot/ vao sys.path de chay standalone, moi ham 1 viec.
Ghi bang service_role (bo qua RLS) -> kiem tra quyen o phia goi neu can.
"""

import sys
from pathlib import Path

# WHY: khi chay `python skills/xxx.py` thi bot/ khong nam tren sys.path -> them vao.
_BOT_DIR = Path(__file__).resolve().parent.parent
if str(_BOT_DIR) not in sys.path:
    sys.path.insert(0, str(_BOT_DIR))

# WHY: skill RAG chay standalone (sync-rag.bat) KHONG qua bot.py -> .env chua duoc nap.
# Nap o day vi moi skill RAG cham DB deu import doc_repo (giong reminder.py/bug_sync.py).
from dotenv import load_dotenv  # noqa: E402
load_dotenv(_BOT_DIR / ".env")

from supabase_client import get_client  # noqa: E402

DOCUMENTS = "documents"
_INSERT_BATCH = 100  # so chunk chen moi lan (an toan duoi gioi han payload PostgREST)


def db():
    """Shortcut lay Supabase client Singleton."""
    return get_client()


def insert_chunks(client, project_id, source: str, chunks: list, embeddings: list) -> int:
    """Chen cac chunk (kem embedding) cua 1 nguon. Tra ve so chunk da chen.

    chunks: list (section, content); embeddings: list vector cung thu tu.
    """
    rows = [
        {
            "project_id": project_id,
            "source": source,
            "section": section,
            "chunk_index": idx,
            "content": content,
            "embedding": vector,
        }
        for idx, ((section, content), vector) in enumerate(zip(chunks, embeddings))
    ]
    for i in range(0, len(rows), _INSERT_BATCH):
        client.table(DOCUMENTS).insert(rows[i:i + _INSERT_BATCH]).execute()
    return len(rows)


def delete_by_source(client, source: str, project_id=None) -> None:
    """Xoa moi chunk cua 1 nguon (dung khi nap lai file da co)."""
    q = client.table(DOCUMENTS).delete().eq("source", source)
    q = q.is_("project_id", "null") if project_id is None else q.eq("project_id", project_id)
    q.execute()


def match(client, query_embedding: list, project_id=None, top_k: int = 5) -> list:
    """Tim top-k chunk gan nhat qua RPC match_documents. Tra ve list dict (co 'similarity')."""
    res = client.rpc(
        "match_documents",
        {
            "query_embedding": query_embedding,
            "match_count": top_k,
            "filter_project": project_id,
        },
    ).execute()
    return res.data or []


def list_sources(client, project_id=None) -> dict:
    """Tra ve {source: so_chunk} de xem da nap nhung gi."""
    q = client.table(DOCUMENTS).select("source")
    if project_id is not None:
        q = q.eq("project_id", project_id)
    counts: dict = {}
    for row in q.execute().data or []:
        s = row.get("source", "?")
        counts[s] = counts.get(s, 0) + 1
    return counts
