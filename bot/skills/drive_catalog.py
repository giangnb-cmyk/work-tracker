"""Skill CLI: lap 'danh muc' tai lieu tren Google Drive -> nap vao kho RAG.

Muc dich: hoi "tai lieu A o dau tren Drive" -> bot tra ten + link mo file. Moi tai lieu la
1 chunk (embedding rieng) nen tim rat chinh xac theo ten/chu de. KHONG tai noi dung file,
chi lap danh muc (ten, loai, thu muc cha, link, ngay sua) -> nhe va nhanh.

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
import os
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows console -> UTF-8 cho tieng Viet
except Exception:
    pass

import requests

import doc_repo as repo  # nap .env + Supabase client (Singleton)
from embeddings import EmbeddingError, embed_batch

_BOT_DIR = Path(__file__).resolve().parent.parent
_REPO_ROOT = _BOT_DIR.parent
_DEFAULT_KEY = _REPO_ROOT / "keys" / "service-account-gsheets.json"

_SOURCE = "Google Drive"  # gom chung 1 'source' -> moi lan chay replace toan bo danh muc
_DRIVE_API = "https://www.googleapis.com/drive/v3/files"
_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
_FOLDER_MIME = "application/vnd.google-apps.folder"

# Loai file duoc coi la "tai lieu" (mac dinh). CO Y bo text/plain, csv, markdown vi trong
# repo dev chung thuong la file cau hinh/asset (vd .atlas.txt) -> nhieu.
_DOC_MIMES = [
    "application/vnd.google-apps.document",
    "application/vnd.google-apps.spreadsheet",
    "application/vnd.google-apps.presentation",
    "application/vnd.google-apps.form",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
]

_MIME_FRIENDLY = {
    "application/vnd.google-apps.document": "Google Docs",
    "application/vnd.google-apps.spreadsheet": "Google Sheets",
    "application/vnd.google-apps.presentation": "Google Slides",
    "application/vnd.google-apps.form": "Google Form",
    "application/pdf": "PDF",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
    "application/msword": "Word",
    "application/vnd.ms-excel": "Excel",
    "application/vnd.ms-powerpoint": "PowerPoint",
    "text/plain": "Text",
    "text/csv": "CSV",
    _FOLDER_MIME: "Thư mục",
}


def die(message: str):
    """In loi ro rang va thoat non-zero (fail fast, khong nuot loi)."""
    print(f"LỖI: {message}")
    sys.exit(1)


def _friendly(mime: str) -> str:
    return _MIME_FRIENDLY.get(mime, (mime or "?").split(".")[-1])


def _resolve_key(cli_key) -> Path:
    """Duong dan service account: --key > env GDRIVE_SERVICE_ACCOUNT > mac dinh keys/..."""
    raw = cli_key or os.getenv("GDRIVE_SERVICE_ACCOUNT") or str(_DEFAULT_KEY)
    p = Path(raw)
    return p if p.is_absolute() else (_REPO_ROOT / p)


def _make_session(key_path: Path) -> requests.Session:
    """Doc service account JSON -> Session da gan Bearer token (chi doc Drive)."""
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request
    except ImportError:
        die("thiếu thư viện google-auth. Cài: pip install -r bot/requirements.txt "
            "(hoặc: pip install google-auth)")
    if not key_path.exists():
        die(f"không thấy service account key '{key_path}'. Xem bot/GOOGLE_SHEETS_MCP.md "
            "Bước 1 (tạo service account, tải JSON, đặt vào keys/service-account-gsheets.json).")
    creds = service_account.Credentials.from_service_account_file(str(key_path), scopes=_SCOPES)
    creds.refresh(Request())
    sess = requests.Session()
    sess.headers["Authorization"] = f"Bearer {creds.token}"
    return sess


def _drive_list(sess: requests.Session, params: dict) -> list:
    """Goi files.list, tu phan trang. Nem/die ro rang khi loi quyen."""
    out, page = [], None
    while True:
        p = dict(params, pageSize=1000, supportsAllDrives="true", includeItemsFromAllDrives="true")
        if page:
            p["pageToken"] = page
        r = sess.get(_DRIVE_API, params=p, timeout=30)
        if r.status_code in (401, 403):
            die("Drive từ chối (401/403): chưa share folder cho email service account, "
                "hoặc chưa bật Google Drive API. Xem GOOGLE_SHEETS_MCP.md Bước 1-2.")
        r.raise_for_status()
        data = r.json()
        out.extend(data.get("files", []))
        page = data.get("nextPageToken")
        if not page:
            return out


def _list_documents(sess: requests.Session, include_all: bool) -> list:
    """Moi file (tru folder) service account thay duoc, loc theo loai tai lieu neu !include_all."""
    q = f"trashed=false and mimeType != '{_FOLDER_MIME}'"
    if not include_all:
        q += " and (" + " or ".join(f"mimeType='{m}'" for m in _DOC_MIMES) + ")"
    print("Đang liệt kê tài liệu trên Drive...", flush=True)
    files = _drive_list(sess, {
        "q": q,
        "fields": "nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,parents)",
        "orderBy": "name",
    })
    print(f"  -> tìm thấy {len(files)} file.", flush=True)
    return files


def _folder_name(sess: requests.Session, fid: str, cache: dict) -> str:
    """Ten thu muc cha (cache lai; 1 GET / folder chua biet)."""
    if fid in cache:
        return cache[fid]
    try:
        r = sess.get(f"{_DRIVE_API}/{fid}", params={"fields": "name", "supportsAllDrives": "true"},
                     timeout=15)
        name = r.json().get("name", "") if r.ok else ""
    except requests.RequestException:
        name = ""
    cache[fid] = name
    return name


def _entry_text(f: dict, parent: str) -> str:
    """1 tai lieu Drive -> doan van ngan de embedding + hien khi bot trich dan."""
    lines = [f.get("name", "?"), f"Loại: {_friendly(f.get('mimeType', ''))}"]
    if parent:
        lines.append(f"Thư mục: {parent}")
    if f.get("modifiedTime"):
        lines.append(f"Sửa lần cuối: {f['modifiedTime'][:10]}")
    if f.get("webViewLink"):
        lines.append(f"Mở: {f['webViewLink']}")
    return "\n".join(lines)


def cmd_sync(args):
    sess = _make_session(_resolve_key(args.key))
    files = _list_documents(sess, args.all)
    if not files:
        die("không tìm thấy tài liệu nào. Đã share folder cho service account chưa? "
            "(Thử --all nếu chỉ có file text/asset.)")

    print("Lấy tên thư mục cha...", flush=True)
    cache: dict = {}
    for f in files:
        f["_parent"] = _folder_name(sess, f["parents"][0], cache) if f.get("parents") else ""

    if args.dry_run:
        print(f"\n[dry-run] {len(files)} tài liệu (không nạp vào kho):")
        for f in files:
            where = f" — {f['_parent']}" if f.get("_parent") else ""
            print(f"  - {f.get('name','?')} [{_friendly(f.get('mimeType',''))}]{where}")
        return

    pairs = [(f.get("name", "?"), _entry_text(f, f.get("_parent", ""))) for f in files]
    print(f"Tạo embedding bge-m3 cho {len(pairs)} mục...", flush=True)
    try:
        vectors = embed_batch([content for _, content in pairs])
    except EmbeddingError as e:
        die(str(e))

    client = repo.db()
    repo.delete_by_source(client, _SOURCE, args.project)  # replace toan bo danh muc cu
    n = repo.insert_chunks(client, args.project, _SOURCE, pairs, vectors)
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
