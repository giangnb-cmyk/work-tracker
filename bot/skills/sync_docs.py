"""Skill CLI: dong bo TOAN BO kho RAG theo thu muc docs/ (nguon su that).

Mot lenh -> nap/embed lai moi FILE trong docs/ + moi LINK trong docs/links.txt,
roi XOA khoi RAG nhung nguon da bi go khoi day (mirror). Dung --no-prune de giu lai.

Day la thao tac QUAN TRI -> chay TAY (khong nam trong allowedTools an toan cua bot).

Vi du (chay trong thu muc bot/):
    python skills\\sync_docs.py                 # dong bo tai lieu chung
    python skills\\sync_docs.py --no-prune      # khong xoa nguon da go
    python skills\\sync_docs.py --project <id>  # dong bo cho 1 project
"""

import argparse
import os
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import doc_reader
import doc_repo as repo
import web_reader
from doc_ingest import build_pairs, store_pairs
from drive_ingest import SOURCE_PREFIX as _DRIVE_PREFIX
from embeddings import EmbeddingError

_BOT_DIR = Path(__file__).resolve().parent.parent
_DEFAULT_DOCS = _BOT_DIR.parent / "docs"
# File cau hinh o goc docs/ -> KHONG nap lam tai lieu.
_CONFIG_NAMES = {"links.txt", "readme.md"}
# Nguon do cong cu KHAC quan ly (khong lay tu docs/) -> prune bo qua, khong xoa nham.
# 'Google Drive' = danh muc do drive_catalog.py nap. Them nguon ngoai khac vao day neu co.
_EXTERNAL_SOURCES = {"Google Drive"}
# ...va moi nguon 'Drive: <ten file>' do drive_ingest.py nap (ruot tai lieu tren Drive).
_EXTERNAL_PREFIXES = (_DRIVE_PREFIX,)


def die(message: str):
    print(f"LỖI: {message}")
    sys.exit(1)


def _collect_doc_files(docs_dir: Path) -> list:
    """Cac file ho tro trong docs/ (de quy), tru file cau hinh o thu muc goc."""
    files = []
    for root, _, names in os.walk(docs_dir):
        for n in names:
            path = os.path.join(root, n)
            is_root = Path(root).resolve() == docs_dir.resolve()
            if is_root and n.lower() in _CONFIG_NAMES:
                continue
            if doc_reader.is_supported(path):
                files.append(path)
    return files


def _read_links(links_file: Path) -> list:
    """Doc links.txt: moi dong 1 URL, bo dong trong / bat dau bang '#'."""
    if not links_file.exists():
        return []
    urls = []
    for line in links_file.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        urls.append(line.split()[0])  # lay token dau (bo ghi chu sau URL neu co)
    return urls


def _ingest_files(client, files: list, project_id, desired: set):
    """Nap tung file (replace). Them source vao desired. Ollama loi -> die."""
    for path in files:
        source = os.path.basename(path)
        try:
            pairs = build_pairs(doc_reader.read_sections(path))
        except doc_reader.UnsupportedFormat:
            continue
        except Exception as e:
            print(f"  - {source}: lỗi đọc file {str(e)[:100]}, bỏ qua.")
            continue
        if not pairs:
            print(f"  - {source}: rỗng / không đọc được chữ (PDF scan?), bỏ qua.")
            continue
        print(f"  - {source}: {len(pairs)} chunk, embedding...", flush=True)
        try:
            store_pairs(client, source, pairs, project_id, replace=True)
        except EmbeddingError as e:
            die(str(e))
        desired.add(source)


def _ingest_links(client, urls: list, project_id, desired: set, protected: set):
    """Tai + nap tung URL (replace). Loi tai -> giu nguon cu (protected), bao cao."""
    for url in urls:
        try:
            pairs = build_pairs(web_reader.read_url(url))
        except web_reader.FetchError as e:
            print(f"  - {url}: tải thất bại ({str(e)[:100]}), giữ bản cũ nếu có.")
            protected.add(url)
            continue
        if not pairs:
            print(f"  - {url}: không có nội dung, bỏ qua.")
            protected.add(url)
            continue
        print(f"  - {url}: {len(pairs)} chunk, embedding...", flush=True)
        try:
            store_pairs(client, url, pairs, project_id, replace=True, default_url=url)
        except EmbeddingError as e:
            die(str(e))
        desired.add(url)


def _prune(client, project_id, keep: set):
    """Xoa khoi RAG nhung nguon khong con trong docs/ (mirror). Tra ve so nguon da xoa.

    KHONG dung toi nguon do cong cu khac quan ly (drive_catalog.py -> 'Google Drive',
    drive_ingest.py -> 'Drive: <ten file>'), neu khong moi lan sync docs/ se xoa sach
    tai lieu Drive - ma nap lai mat ~2 gio embedding.
    """
    existing = set(repo.list_sources(client, project_id))
    stale = {s for s in existing - keep - _EXTERNAL_SOURCES
             if not s.startswith(_EXTERNAL_PREFIXES)}
    for source in sorted(stale):
        repo.delete_by_source(client, source, project_id)
        print(f"  - gỡ: {source}")
    return len(stale)


def main():
    parser = argparse.ArgumentParser(description="Dong bo kho RAG theo thu muc docs/.")
    parser.add_argument("--docs", default=str(_DEFAULT_DOCS), help="Thu muc tai lieu (mac dinh: <repo>/docs)")
    parser.add_argument("--project", help="project_id de gan tai lieu (bo trong = tai lieu chung)")
    parser.add_argument("--no-prune", action="store_true", help="Khong xoa nguon da go khoi docs/")
    args = parser.parse_args()

    docs_dir = Path(args.docs)
    if not docs_dir.exists():
        die(f"không thấy thư mục docs '{docs_dir}'. Tạo thư mục và bỏ tài liệu vào trước.")

    client = repo.db()
    files = _collect_doc_files(docs_dir)
    urls = _read_links(docs_dir / "links.txt")
    print(f"Đồng bộ: {len(files)} file + {len(urls)} link"
          f"{(' -> project ' + args.project) if args.project else ' (tài liệu chung)'}")

    desired, protected = set(), set()
    if files:
        print("Nạp file:")
        _ingest_files(client, files, args.project, desired)
    if urls:
        print("Nạp link:")
        _ingest_links(client, urls, args.project, desired, protected)

    pruned = 0
    if not args.no_prune:
        print("Dọn nguồn đã gỡ:")
        pruned = _prune(client, args.project, desired | protected)

    print(f"\nXong. Nguồn hiện có: {len(desired)} | tải lỗi giữ lại: {len(protected)} | đã gỡ: {pruned}.")


if __name__ == "__main__":
    main()
