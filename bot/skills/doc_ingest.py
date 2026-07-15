"""Skill CLI: nap tai lieu vao kho RAG (Supabase pgvector) bang bge-m3.

Day la thao tac QUAN TRI (nap/xoa tai lieu), nen chay TAY, KHONG nam trong
danh sach allowedTools an toan cua bot. In 'LOI: ...' va thoat != 0 khi loi.

Vi du:
    python doc_ingest.py add ./tai_lieu --project 620a1a7d-...    # nap ca thu muc
    python doc_ingest.py add spec.pdf                            # tai lieu chung (khong project)
    python doc_ingest.py add spec.pdf --replace                  # nap lai, xoa ban cu truoc
    python doc_ingest.py list [--project <id>]                   # xem da nap gi
    python doc_ingest.py remove --source spec.pdf                # xoa 1 nguon
"""

import argparse
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows console -> UTF-8 cho tieng Viet
except Exception:
    pass

import doc_reader
import doc_repo as repo
from embeddings import EmbeddingError, embed_batch


def die(message: str):
    """In loi ro rang va thoat non-zero (fail fast, khong nuot loi)."""
    print(f"LỖI: {message}")
    sys.exit(1)


# --- Helper dung chung (doc_ingest + sync_docs) ------------------------------

def build_pairs(sections: list) -> list:
    """(section, text) da doc -> list (section, chunk). Thuan, khong I/O."""
    pairs = []
    for label, text in sections:
        for content in doc_reader.chunk_text(text):
            pairs.append((label, content))
    return pairs


def store_pairs(client, source: str, pairs: list, project_id, replace: bool) -> int:
    """Embed cac chunk roi ghi vao DB. replace=True -> xoa ban cu cung source truoc."""
    if not pairs:
        return 0
    vectors = embed_batch([content for _, content in pairs])
    if replace:
        repo.delete_by_source(client, source, project_id)
    return repo.insert_chunks(client, project_id, source, pairs, vectors)


def _collect_files(target: str) -> list:
    """Tra ve danh sach file ho tro tu 1 file hoac thu muc (de quy)."""
    if not os.path.exists(target):
        die(f"không tìm thấy '{target}'")
    if os.path.isfile(target):
        return [target]
    found = []
    for root, _, names in os.walk(target):
        for n in names:
            path = os.path.join(root, n)
            if doc_reader.is_supported(path):
                found.append(path)
    return found


def _ingest_one(client, path: str, project_id, replace: bool) -> int:
    """Nap 1 file -> so chunk da nap. Bo qua file rong. Nem loi de caller xu ly."""
    source = os.path.basename(path)
    pairs = build_pairs(doc_reader.read_sections(path))
    if not pairs:
        print(f"  - {source}: rỗng / không đọc được chữ (PDF scan?), bỏ qua.")
        return 0
    print(f"  - {source}: {len(pairs)} chunk, đang tạo embedding bge-m3...", flush=True)
    return store_pairs(client, source, pairs, project_id, replace)


def cmd_add(args):
    client = repo.db()
    files = _collect_files(args.target)
    if not files:
        die(f"không có file định dạng hỗ trợ trong '{args.target}' "
            f"(hỗ trợ: {', '.join(sorted(doc_reader.SUPPORTED_EXTS))})")

    total, nfiles = 0, 0
    where = f" vào project {args.project}" if args.project else " (tài liệu chung)"
    print(f"Nạp {len(files)} file{where}:")
    for path in files:
        try:
            n = _ingest_one(client, path, args.project, args.replace)
        except doc_reader.UnsupportedFormat:
            continue
        except EmbeddingError as e:
            die(str(e))  # Ollama loi -> dung han, khong nap do
        except Exception as e:
            print(f"  - {os.path.basename(path)}: lỗi {str(e)[:120]}, bỏ qua.")
            continue
        total += n
        nfiles += 1 if n else 0
    print(f"Xong: nạp {nfiles} file, tổng {total} chunk vào kho.")


def cmd_list(args):
    client = repo.db()
    counts = repo.list_sources(client, args.project)
    if not counts:
        print("Kho tài liệu trống. Nạp bằng: python doc_ingest.py add <đường_dẫn>")
        return
    total = sum(counts.values())
    print(f"Kho có {total} chunk từ {len(counts)} nguồn:")
    for source, c in sorted(counts.items()):
        print(f"  - {source}: {c} chunk")


def cmd_remove(args):
    client = repo.db()
    repo.delete_by_source(client, args.source, args.project)
    print(f"Đã xoá nguồn '{args.source}' khỏi kho.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Nap/xoa tai lieu cho kho RAG (Supabase pgvector).")
    sub = parser.add_subparsers(dest="command", required=True)

    a = sub.add_parser("add", help="Nap file hoac thu muc")
    a.add_argument("target", help="Duong dan file hoac thu muc")
    a.add_argument("--project", help="project_id (uuid) de gan tai lieu; bo trong = tai lieu chung")
    a.add_argument("--replace", action="store_true", help="Xoa ban cu cua cung ten file truoc khi nap")
    a.set_defaults(func=cmd_add)

    l = sub.add_parser("list", help="Xem cac nguon da nap")
    l.add_argument("--project", help="Loc theo project_id")
    l.set_defaults(func=cmd_list)

    r = sub.add_parser("remove", help="Xoa 1 nguon theo ten file")
    r.add_argument("--source", required=True, help="Ten file (source) can xoa")
    r.add_argument("--project", help="project_id (neu tai lieu gan project)")
    r.set_defaults(func=cmd_remove)
    return parser


def main():
    args = build_parser().parse_args()
    try:
        args.func(args)
    except SystemExit:
        raise
    except Exception as e:  # loi ngoai y muon -> van in LOI ro rang
        die(f"lỗi không mong đợi: {e}")


if __name__ == "__main__":
    main()
