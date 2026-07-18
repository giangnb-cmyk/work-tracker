"""Skill CLI: lap 'danh muc' tai lieu tren Google Drive -> nap vao kho RAG.

Muc dich: hoi "tai lieu A o dau tren Drive" -> bot tra ten + link mo file. Moi tai lieu la
1 chunk (embedding rieng) nen tim rat chinh xac theo ten/chu de. KHONG tai noi dung file,
chi lap danh muc (ten, loai, thu muc cha, link, ngay sua) -> nhe va nhanh.

Muon bot tra loi ve NOI DUNG ben trong file thi chay them drive_ingest.py (nap 'ruot').
Hai skill bo sung nhau: danh muc de TIM file, ruot de TRA LOI tu file.

CHI liet ke file DANG TAI LIEU (Google Docs/Sheets/Slides/Form, PDF, Word/Excel/PowerPoint) -
bo qua anh/video/asset (vd .atlas.txt trong repo game). Dung --all de lay MOI loai file.

Pham vi = MOI thu duoc chia se voi service account. Muon gioi han: chia se DUNG folder can
index cho email service account (khong chia se ca kho). Dung SERVICE ACCOUNT (chi doc) -
dung chung voi Google Sheets MCP (xem GOOGLE_SHEETS_MCP.md).

Day la thao tac QUAN TRI -> chay TAY, KHONG nam trong allowedTools an toan cua bot.

Vi du (chay trong thu muc bot/):
    python skills\\drive_catalog.py                 # nap danh muc tai lieu vao kho
    python skills\\drive_catalog.py --dry-run       # chi liet ke, khong nap
    python skills\\drive_catalog.py --all           # lay moi loai file (co the rat nhieu)
    python skills\\drive_catalog.py --project <id>  # gan danh muc vao 1 project
"""

import argparse
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows console -> UTF-8 cho tieng Viet
except Exception:
    pass

import doc_repo as repo  # nap .env + Supabase client (Singleton)
import drive_gateway as drive
from embeddings import EmbeddingError, embed_batch

_SOURCE = "Google Drive"  # gom chung 1 'source' -> moi lan chay replace toan bo danh muc


def die(message: str):
    """In loi ro rang va thoat non-zero (fail fast, khong nuot loi)."""
    print(f"LỖI: {message}")
    sys.exit(1)


def _entry_text(f: dict, parent: str) -> str:
    """1 tai lieu Drive -> doan van ngan de embedding + hien khi bot trich dan."""
    lines = [f.get("name", "?"), f"Loại: {drive.friendly(f.get('mimeType', ''))}"]
    if parent:
        lines.append(f"Thư mục: {parent}")
    if f.get("modifiedTime"):
        lines.append(f"Sửa lần cuối: {f['modifiedTime'][:10]}")
    if f.get("webViewLink"):
        lines.append(f"Mở: {f['webViewLink']}")
    return "\n".join(lines)


def _list_all(args) -> list:
    """Liet ke tai lieu + gan ten thu muc cha. Nem DriveError cho caller."""
    sess = drive.make_session(drive.resolve_key(args.key))
    print("Đang liệt kê tài liệu trên Drive...", flush=True)
    files = drive.list_documents(sess, args.all)
    print(f"  -> tìm thấy {len(files)} file.", flush=True)
    if files:
        print("Lấy tên thư mục cha...", flush=True)
        drive.attach_parents(sess, files)
    return files


def _print_dry_run(files: list):
    print(f"\n[dry-run] {len(files)} tài liệu (không nạp vào kho):")
    for f in files:
        where = f" — {f['_parent']}" if f.get("_parent") else ""
        print(f"  - {f.get('name','?')} [{drive.friendly(f.get('mimeType',''))}]{where}")


def cmd_sync(args):
    try:
        files = _list_all(args)
    except drive.DriveError as e:
        die(str(e))
    if not files:
        die("không tìm thấy tài liệu nào. Đã share folder cho service account chưa? "
            "(Thử --all nếu chỉ có file text/asset.)")

    if args.dry_run:
        _print_dry_run(files)
        return

    pairs = [(f.get("name", "?"), _entry_text(f, f.get("_parent", ""))) for f in files]
    # section == ten file -> gan luon webViewLink de hit danh muc co san link mo file.
    section_urls = {f.get("name", "?"): f.get("webViewLink") for f in files if f.get("webViewLink")}
    print(f"Tạo embedding bge-m3 cho {len(pairs)} mục...", flush=True)
    try:
        vectors = embed_batch([content for _, content in pairs])
    except EmbeddingError as e:
        die(str(e))

    client = repo.db()
    repo.delete_by_source(client, _SOURCE, args.project)  # replace toan bo danh muc cu
    n = repo.insert_chunks(client, args.project, _SOURCE, pairs, vectors, section_urls=section_urls)
    print(f"Xong: nạp {n} mục vào kho (nguồn '{_SOURCE}'). "
          f"Hỏi thử: python skills\\doc_search.py \"tài liệu ... nằm ở đâu\"")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Lap danh muc tai lieu Google Drive -> nap vao RAG.")
    p.add_argument("--project", help="project_id de gan danh muc (bo trong = tai lieu chung)")
    p.add_argument("--key", help="Duong dan service account JSON (mac dinh keys/service-account-gsheets.json)")
    p.add_argument("--all", action="store_true", help="Lay MOI loai file (ke ca anh/asset/text), khong chi tai lieu")
    p.add_argument("--dry-run", action="store_true", help="Chi liet ke, khong nap vao kho")
    p.set_defaults(func=cmd_sync)
    return p


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
