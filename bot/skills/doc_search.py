"""Skill CLI: tim tai lieu lien quan trong kho RAG (Supabase pgvector) bang bge-m3.

Claude goi script nay (o che do an toan, day la skill duy nhat cua RAG duoc phep chay)
khi nguoi dung hoi ve NOI DUNG tai lieu (spec, tai lieu hop, huong dan...).
In cac doan lien quan kem nguon de Claude tong hop tra loi. In 'LOI: ...' khi that bai.

Vi du:
    python doc_search.py "quy trinh release gom nhung buoc nao?"
    python doc_search.py "chinh sach nghi phep" --project 620a1a7d-... --top-k 6
"""

import argparse
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows console -> UTF-8 cho tieng Viet
except Exception:
    pass

import doc_repo as repo
from embeddings import EmbeddingError, embed_text

_MAX_SNIPPET = 700  # cat bot moi doan cho gon khi in ra cho Claude


def die(message: str):
    print(f"LOI: {message}")
    sys.exit(1)


def _clip(text: str) -> str:
    text = (text or "").strip()
    return text if len(text) <= _MAX_SNIPPET else text[:_MAX_SNIPPET] + " [...]"


def cmd_search(args):
    query = (args.query or "").strip()
    if not query:
        die("thiếu câu truy vấn")

    try:
        vector = embed_text(query)
    except EmbeddingError as e:
        die(str(e))

    hits = repo.match(repo.db(), vector, project_id=args.project, top_k=args.top_k)
    if not hits:
        print("Không tìm thấy tài liệu liên quan trong kho "
              "(có thể chưa nạp tài liệu nào: chạy doc_ingest.py add ...).")
        return

    print(f"Tìm thấy {len(hits)} đoạn liên quan (nguồn ở cuối mỗi đoạn):")
    for i, h in enumerate(hits, 1):
        sim = h.get("similarity")
        sim_s = f"{sim:.2f}" if isinstance(sim, (int, float)) else "?"
        src = h.get("source", "?")
        section = h.get("section", "")
        where = f"{src} — {section}" if section else src
        print(f"\n[{i}] (độ liên quan {sim_s}) nguồn: {where}")
        print(_clip(h.get("content", "")))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Tim tai lieu lien quan trong kho RAG (bge-m3 + pgvector).")
    parser.add_argument("query", help="Cau hoi / tu khoa can tim trong tai lieu")
    parser.add_argument("--project", help="Loc theo project_id (bo trong = tim moi tai lieu)")
    parser.add_argument("--top-k", type=int, default=5, help="So doan lay ra (mac dinh 5)")
    parser.set_defaults(func=cmd_search)
    return parser


def main():
    args = build_parser().parse_args()
    try:
        args.func(args)
    except SystemExit:
        raise
    except Exception as e:
        die(f"lỗi không mong đợi: {e}")


if __name__ == "__main__":
    main()
