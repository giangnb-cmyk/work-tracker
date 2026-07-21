"""Adapter: noi chuyen voi Google Drive API (CHI DOC) bang service account.

Mot viec duy nhat: xac thuc + goi Drive REST (liet ke file, ten thu muc cha, tai/export
noi dung). Cac skill dung chung lop nay -> khong lap lai code xac thuc/phan trang:
  - drive_catalog.py -> lap DANH MUC (ten + link)
  - drive_ingest.py  -> nap RUOT (noi dung) vao kho RAG

Nem DriveError khi that bai (lop goi tu in 'LỖI: ...' va thoat) - khong tu sys.exit,
de con dung lai duoc tu bot.py hoac skill khac.

Dung SERVICE ACCOUNT (chi doc), dung chung voi Google Sheets MCP (xem GOOGLE_SHEETS_MCP.md).
"""

import os
from pathlib import Path

import requests

_BOT_DIR = Path(__file__).resolve().parent.parent
_REPO_ROOT = _BOT_DIR.parent
_DEFAULT_KEY = _REPO_ROOT / "keys" / "service-account-gsheets.json"

API = "https://www.googleapis.com/drive/v3/files"
SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
FOLDER_MIME = "application/vnd.google-apps.folder"
SHEET_MIME = "application/vnd.google-apps.spreadsheet"  # Google Sheets (khong phai .xlsx)

_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_MAX_BYTES = 25 * 1024 * 1024  # chan file khong lo (Drive cung chi export toi ~10MB)

# Loai file duoc coi la "tai lieu" (mac dinh). CO Y bo text/plain, csv, markdown vi trong
# repo dev chung thuong la file cau hinh/asset (vd .atlas.txt) -> nhieu.
DOC_MIMES = [
    "application/vnd.google-apps.document",
    SHEET_MIME,
    "application/vnd.google-apps.presentation",
    "application/vnd.google-apps.form",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    _XLSX_MIME,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
]

MIME_FRIENDLY = {
    "application/vnd.google-apps.document": "Google Docs",
    SHEET_MIME: "Google Sheets",
    "application/vnd.google-apps.presentation": "Google Slides",
    "application/vnd.google-apps.form": "Google Form",
    "application/pdf": "PDF",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
    _XLSX_MIME: "Excel",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
    "application/msword": "Word",
    "application/vnd.ms-excel": "Excel",
    "application/vnd.ms-powerpoint": "PowerPoint",
    "text/plain": "Text",
    "text/csv": "CSV",
    FOLDER_MIME: "Thư mục",
}

# File Google-native -> export sang dinh dang doc_reader doc duoc.
# Sheets -> .xlsx (giu MOI tab; export text/csv chi lay tab dau tien).
_EXPORT_AS = {
    "application/vnd.google-apps.document": ("text/plain", ".txt"),
    SHEET_MIME: (_XLSX_MIME, ".xlsx"),
    "application/vnd.google-apps.presentation": ("text/plain", ".txt"),
}

# File nhi phan khong co duoi trong ten -> suy duoi tu mime.
_BINARY_EXT = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    _XLSX_MIME: ".xlsx",
    "text/plain": ".txt",
    "text/csv": ".csv",
}


class DriveError(RuntimeError):
    """Loi khi goi Drive that bai / thieu quyen -> skill in 'LỖI:' va thoat."""


class ExportTooLarge(DriveError):
    """File Google-native > 10MB: Drive tu choi export ('exportSizeLimitExceeded').

    KHONG phai loi quyen — caller co the doc bang duong khac (vd sheets_reader qua
    Sheets API, doc theo vung nen khong dinh gioi han nay).
    """


def _reason(r: requests.Response) -> str:
    """Ly do loi Google tra ve (vd 'exportSizeLimitExceeded'), '' neu khong doc duoc."""
    try:
        errors = r.json().get("error", {}).get("errors", [])
        return errors[0].get("reason", "") if errors else ""
    except ValueError:
        return ""


def friendly(mime: str) -> str:
    """Ten loai file de doc cho nguoi (vd 'Google Sheets')."""
    return MIME_FRIENDLY.get(mime, (mime or "?").split(".")[-1])


def sheet_tab_url(sheet_id: str, gid) -> str:
    """Link mo Google Sheet ngay tai DUNG tab (gid). webViewLink chi mo tab dang active,
    dia chi '#gid=' moi dua thang toi tab can — de bot 'gui tai lieu dung tab'."""
    return f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit#gid={gid}"


def resolve_key(cli_key=None) -> Path:
    """Duong dan service account: --key > env GDRIVE_SERVICE_ACCOUNT > mac dinh keys/..."""
    raw = cli_key or os.getenv("GDRIVE_SERVICE_ACCOUNT") or str(_DEFAULT_KEY)
    p = Path(raw)
    return p if p.is_absolute() else (_REPO_ROOT / p)


def make_session(key_path: Path) -> requests.Session:
    """Doc service account JSON -> Session tu dong lam moi token (chi doc Drive).

    WHY AuthorizedSession chu khong phai `creds.refresh()` 1 lan roi gan header thu cong:
    token cua service account chi song 1 TIENG. Nap ruot ca kho Drive mat ~2 tieng
    (embedding local ~3s/chunk) -> gan giua chung moi request deu 401 'invalid
    authentication credentials' va hong phan con lai. AuthorizedSession tu xin token moi
    khi sap het han, nen chay bao lau cung duoc.
    """
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import AuthorizedSession
    except ImportError as e:
        raise DriveError("thiếu thư viện google-auth. Cài: pip install -r bot/requirements.txt "
                         "(hoặc: pip install google-auth)") from e
    if not key_path.exists():
        raise DriveError(f"không thấy service account key '{key_path}'. Xem bot/GOOGLE_SHEETS_MCP.md "
                         "Bước 1 (tạo service account, tải JSON, đặt vào keys/service-account-gsheets.json).")
    creds = service_account.Credentials.from_service_account_file(str(key_path), scopes=SCOPES)
    return AuthorizedSession(creds)


def list_files(sess: requests.Session, params: dict) -> list:
    """Goi files.list, tu phan trang. Nem DriveError ro rang khi loi quyen."""
    out, page = [], None
    while True:
        p = dict(params, pageSize=1000, supportsAllDrives="true", includeItemsFromAllDrives="true")
        if page:
            p["pageToken"] = page
        r = sess.get(API, params=p, timeout=30)
        if r.status_code in (401, 403):
            raise DriveError("Drive từ chối (401/403): chưa share folder cho email service account, "
                             "hoặc chưa bật Google Drive API. Xem GOOGLE_SHEETS_MCP.md Bước 1-2.")
        r.raise_for_status()
        data = r.json()
        out.extend(data.get("files", []))
        page = data.get("nextPageToken")
        if not page:
            return out


def list_documents(sess: requests.Session, include_all: bool = False) -> list:
    """Moi file (tru folder) service account thay duoc, loc theo loai tai lieu neu !include_all."""
    q = f"trashed=false and mimeType != '{FOLDER_MIME}'"
    if not include_all:
        q += " and (" + " or ".join(f"mimeType='{m}'" for m in DOC_MIMES) + ")"
    return list_files(sess, {
        "q": q,
        "fields": "nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,parents)",
        "orderBy": "name",
    })


def folder_name(sess: requests.Session, fid: str, cache: dict) -> str:
    """Ten thu muc cha (cache lai; 1 GET / folder chua biet)."""
    if fid in cache:
        return cache[fid]
    try:
        r = sess.get(f"{API}/{fid}", params={"fields": "name", "supportsAllDrives": "true"}, timeout=15)
        name = r.json().get("name", "") if r.ok else ""
    except requests.RequestException:
        name = ""
    cache[fid] = name
    return name


def attach_parents(sess: requests.Session, files: list) -> None:
    """Gan f['_parent'] = ten thu muc cha cho moi file (dung chung 1 cache)."""
    cache: dict = {}
    for f in files:
        f["_parent"] = folder_name(sess, f["parents"][0], cache) if f.get("parents") else ""


def _folder_parent(sess: requests.Session, fid: str, cache: dict):
    """Id thu muc CHA cua folder `fid` (cache; 1 GET/folder). None neu la goc/loi."""
    if fid in cache:
        return cache[fid]
    parent = None
    try:
        r = sess.get(f"{API}/{fid}", params={"fields": "parents", "supportsAllDrives": "true"}, timeout=15)
        if r.ok:
            parents = r.json().get("parents") or []
            parent = parents[0] if parents else None
    except requests.RequestException:
        parent = None
    cache[fid] = parent
    return parent


def folder_ancestors(sess: requests.Session, f: dict, cache: dict) -> list:
    """Tap id folder TO TIEN cua file: folder cha + moi cap tren tro toi goc.

    Dung de gioi han RAG theo folder cho member (tinh ca folder con — 0050): file nam sau
    trong cay se co id folder muc tieu trong danh sach nay. Cache dung chung qua nhieu file.
    """
    ids, seen = [], set()
    fid = (f.get("parents") or [None])[0]
    while fid and fid not in seen:
        seen.add(fid)
        ids.append(fid)
        fid = _folder_parent(sess, fid, cache)
    return ids


def local_ext(f: dict):
    """Duoi file cuc bo sau khi tai ve, hoac None neu khong the lay chu (Form/Drawing...)."""
    mime = f.get("mimeType", "")
    if mime in _EXPORT_AS:
        return _EXPORT_AS[mime][1]
    if mime.startswith("application/vnd.google-apps."):
        return None  # Form / Drawing / Site: khong co ban text co nghia
    return os.path.splitext(f.get("name", ""))[1].lower() or _BINARY_EXT.get(mime)


def download(sess: requests.Session, f: dict, dest_dir) -> str:
    """Tai/export 1 file Drive vao dest_dir -> duong dan cuc bo. Nem DriveError neu that bai.

    Ten file cuc bo dat theo Drive id (khong theo ten that) -> tranh trung ten giua cac
    thu muc va ky tu khong hop le tren Windows. Chi duoi file la quan trong (doc_reader).
    """
    ext = local_ext(f)
    if not ext:
        raise DriveError(f"loại file không lấy được chữ ({friendly(f.get('mimeType', ''))})")

    fid, mime = f["id"], f.get("mimeType", "")
    if mime in _EXPORT_AS:
        url, params = f"{API}/{fid}/export", {"mimeType": _EXPORT_AS[mime][0]}
    else:
        url, params = f"{API}/{fid}", {"alt": "media", "supportsAllDrives": "true"}

    path = Path(dest_dir) / f"{fid}{ext}"
    try:
        with sess.get(url, params=params, timeout=120, stream=True) as r:
            if r.status_code in (401, 403):
                # 'exportSizeLimitExceeded' = file > 10MB, KHONG phai loi quyen -> tach ra
                # de caller thu duong khac thay vi bao "chua share folder".
                if _reason(r) == "exportSizeLimitExceeded":
                    raise ExportTooLarge("file lớn hơn 10MB nên Drive không export được")
                raise DriveError("Drive từ chối tải (401/403): chưa share file cho service account, "
                                 "hoặc chưa bật Drive API.")
            r.raise_for_status()
            size = 0
            with open(path, "wb") as out:
                for block in r.iter_content(chunk_size=64 * 1024):
                    size += len(block)
                    if size > _MAX_BYTES:
                        raise DriveError(f"file lớn hơn {_MAX_BYTES // (1024 * 1024)}MB, bỏ qua")
                    out.write(block)
    except requests.RequestException as e:
        raise DriveError(f"tải thất bại: {e}") from e
    return str(path)
