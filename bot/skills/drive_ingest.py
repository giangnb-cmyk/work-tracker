"""Skill CLI: nap RUOT (noi dung) tai lieu tren Google Drive vao kho RAG.

Khac drive_catalog.py - von chi lap DANH MUC (ten, loai, thu muc, link) de tra loi
"tai lieu A nam o dau". Skill nay TAI va DOC noi dung tung tai lieu (Google Docs/Sheets/
Slides, PDF, Word, Excel) -> cat chunk -> embedding -> kho RAG, de bot tra loi duoc cau
hoi ve NOI DUNG ben trong file. Hai skill bo sung nhau, chay ca hai.

BO QUA loai file "khong dang doc ruot" - mac dinh la thu muc cau hinh game (csv_config)
va bang dich thuat (localization): toan cap chuoi/bang so, nap vao chi lam nhieu kho ma
khong tra loi duoc gi. Quy tac nam trong settings.json > "rag_drive_skip" (KHONG hardcode)
-> du an sau chi them vao do, khong phai sua code. Xem SkipRules ben duoi.

Cac file bi bo qua VAN nam trong DANH MUC (drive_catalog.py) -> bot van chi duoc "file
nam o dau", chi khong doc ruot chung.

Source trong kho = "Drive: <ten file>" -> sync_docs.py biet khong prune nham, va bot
trich dan ro day la tai lieu tren Drive.

NAP TANG DAN: chi nap lai file co modifiedTime khac ban trong kho (documents.source_version,
migration 0027). Embedding local ~3s/chunk -> nap lai ca kho (~2.4k chunk) mat ~2 gio,
khong the lam moi ngay. Ngay thuong gan nhu khong ton gi. Ep nap lai het: --force.

Day la thao tac QUAN TRI -> chay TAY / theo lich, KHONG nam trong allowedTools an toan.

Vi du (chay trong thu muc bot/):
    python skills\\drive_ingest.py                      # nap ruot (tru csv_config + localization)
    python skills\\drive_ingest.py --dry-run            # chi dem chunk, khong embed/nap
    python skills\\drive_ingest.py --skip-folder QA     # bo qua them thu muc QA
    python skills\\drive_ingest.py --skip-name balance  # bo qua them file co ten chua 'balance'
    python skills\\drive_ingest.py --no-skip            # nap TAT CA, bo moi bo loc
    python skills\\drive_ingest.py --force              # nap lai ca file khong doi
    python skills\\drive_ingest.py --project <id>       # gan tai lieu vao 1 project
"""

import argparse
import json
import sys
import tempfile
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows console -> UTF-8 cho tieng Viet
except Exception:
    pass

import doc_reader
import doc_repo as repo
import drive_gateway as drive
import sheets_reader
from doc_ingest import build_pairs, store_pairs
from embeddings import EmbeddingError

SOURCE_PREFIX = "Drive: "  # sync_docs.py doi chieu tien to nay khi prune -> dung doi tuy tien
_MAX_CHUNKS = 300  # tran chunk/file: chan 1 sheet khong lo nuot ca lan chay

_BOT_DIR = Path(__file__).resolve().parent.parent
_SETTINGS_KEY = "rag_drive_skip"

# Mac dinh khi settings.json chua khai bao "rag_drive_skip" -> du an moi van co bo loc
# hop ly ngay tu dau. Sua/them thi sua trong settings.json, DUNG sua o day.
DEFAULT_SKIP_FOLDERS = ("csv_config",)
DEFAULT_SKIP_NAMES = ("localization", "localize")


def die(message: str):
    """In loi ro rang va thoat non-zero (fail fast, khong nuot loi)."""
    print(f"LỖI: {message}")
    sys.exit(1)


def _load_settings() -> dict:
    """settings.json (giong bug_sync/member_dm). Thieu/hong -> dung mac dinh, dung chet."""
    try:
        return json.loads((_BOT_DIR / "settings.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        print(f"  (không đọc được settings.json: {str(e)[:80]} -> dùng bộ lọc mặc định)")
        return {}


class SkipRules:
    """Quy tac 'file nao khong dang doc ruot' — doc tu settings.json > rag_drive_skip.

    WHY tach ra config thay vi hardcode: du an nao cung co loai file chi toan bang so /
    cap chuoi (config game, localization, asset list). Nap ruot chung vao RAG lam nhieu
    kho ma khong tra loi duoc cau hoi nao. De o settings.json thi du an sau chi them 1
    dong config, khong phai sua code va khong phai dieu tra lai tu dau.

    folders: khop CHINH XAC ten thu muc cha (khong phan biet hoa thuong).
    names:   khop MOT PHAN ten file (vd 'localization' bat 'M1 - Localization.csv').
    """

    def __init__(self, folders=(), names=()):
        self.folders = {s.strip().lower() for s in folders if s and s.strip()}
        self.names = {s.strip().lower() for s in names if s and s.strip()}

    @classmethod
    def from_args(cls, args) -> "SkipRules":
        """Quy tac cuoi = settings.json (hoac mac dinh) + co them tu CLI. --no-skip = rong."""
        if args.no_skip:
            return cls()
        cfg = _load_settings().get(_SETTINGS_KEY) or {}
        return cls(
            list(cfg.get("folders", DEFAULT_SKIP_FOLDERS)) + list(args.skip_folder or []),
            list(cfg.get("name_contains", DEFAULT_SKIP_NAMES)) + list(args.skip_name or []),
        )

    def reason(self, f: dict):
        """Ly do bo qua file nay, None = giu lai. Tra ve chuoi de in cho nguoi doc hieu."""
        parent = f.get("_parent", "").strip()
        if parent.lower() in self.folders:
            return f"thư mục '{parent}'"
        name = f.get("name", "").lower()
        hit = next((s for s in sorted(self.names) if s in name), None)
        return f"tên chứa '{hit}'" if hit else None

    def describe(self) -> str:
        """Mo ta bo loc dang ap dung (in ra dau moi lan chay cho minh bach)."""
        parts = []
        if self.folders:
            parts.append("thư mục: " + ", ".join(sorted(self.folders)))
        if self.names:
            parts.append("tên chứa: " + ", ".join(sorted(self.names)))
        return " | bỏ qua " + "; ".join(parts) if parts else " | không bỏ qua gì"


class _Job:
    """Tham so cua 1 lan nap (options object) -> khong truyen 6 doi so lan nhau.

    client = None khi dry_run (khong cham DB).
    known = {source: modifiedTime da nap} -> bo qua file khong doi (sync tang dan).
    """

    def __init__(self, sess, tmpdir: str, args):
        self.sess = sess
        self.tmpdir = tmpdir
        self.project_id = args.project
        self.dry_run = args.dry_run
        self.force = args.force
        self.client = None if args.dry_run else repo.db()
        self.known = {} if self.client is None else repo.source_versions(
            self.client, SOURCE_PREFIX, args.project)

    def is_fresh(self, source: str, modified: str) -> bool:
        """Nguon da co trong kho DUNG phien ban Drive hien tai -> khoi nap lai."""
        if self.force or not modified:
            return False
        return self.known.get(source) == modified


def _split_targets(files: list, skip: SkipRules) -> tuple:
    """Chia danh sach Drive -> (file can nap, [(ten, ly do bo qua)]).

    Bao cao ca phan bi bo qua -> nguoi chay thay ro da bo gi, khong loc am tham.
    """
    kept, dropped = [], []
    for f in files:
        reason = skip.reason(f)
        if reason:
            dropped.append((f.get("name", "?"), reason))
        elif drive.local_ext(f) is None:
            dropped.append((f.get("name", "?"), f"loại {drive.friendly(f.get('mimeType', ''))}"))
        else:
            kept.append(f)
    return kept, dropped


def _cap(pairs: list) -> list:
    """Cat bot neu file qua dai. In ro da bo bao nhieu - khong am tham cat."""
    if len(pairs) <= _MAX_CHUNKS:
        return pairs
    print(f"    (dài {len(pairs)} chunk -> chỉ nạp {_MAX_CHUNKS} chunk đầu)")
    return pairs[:_MAX_CHUNKS]


def _read_sections(job: _Job, f: dict) -> list:
    """Noi dung 1 tai lieu -> list (section, text).

    Duong chinh: tai/export ve file tam roi doc bang doc_reader (dung cho moi dinh dang).
    Sheet > 10MB thi Drive tu choi export -> doc thang qua Sheets API (khong dinh gioi han).
    """
    try:
        return doc_reader.read_sections(drive.download(job.sess, f, job.tmpdir))
    except drive.ExportTooLarge:
        if f.get("mimeType") != drive.SHEET_MIME:
            raise
        print("    (>10MB, đọc qua Sheets API thay vì tải .xlsx)", flush=True)
        return sheets_reader.read_sheet(job.sess, f["id"])


def _ingest_one(job: _Job, f: dict) -> int:
    """Tai + doc + (nap) 1 tai lieu. Tra ve so chunk; 0 = bo qua. Nem loi cho caller loc."""
    name = f.get("name", "?")
    pairs = _cap(build_pairs(_read_sections(job, f)))
    if not pairs:
        print(f"  - {name}: rỗng / không đọc được chữ (PDF scan?), bỏ qua.")
        return 0
    if job.dry_run:
        print(f"  - {name}: {len(pairs)} chunk (dry-run, không nạp)")
        return len(pairs)
    print(f"  - {name}: {len(pairs)} chunk, embedding...", flush=True)
    store_pairs(job.client, SOURCE_PREFIX + name, pairs, job.project_id, replace=True,
                source_version=f.get("modifiedTime"))
    return len(pairs)


def _ingest(job: _Job, files: list) -> set:
    """Nap ruot tung file. Tra ve tap source dang CO trong kho (da nap + con nguyen).

    File khong doi ke tu lan sync truoc thi bo qua: embedding local ~3s/chunk nen nap lai
    ca kho moi ngay la khong kha thi. Nguon bo qua VAN nam trong tap tra ve -> prune
    khong xoa nham.
    """
    done, total, fresh = set(), 0, 0
    for f in files:
        name = f.get("name", "?")
        source = SOURCE_PREFIX + name
        if job.is_fresh(source, f.get("modifiedTime")):
            done.add(source)
            fresh += 1
            continue
        try:
            n = _ingest_one(job, f)
        except EmbeddingError as e:
            die(str(e))  # Ollama chet -> dung han, dung xoa tiep bang replace
        except (drive.DriveError, sheets_reader.SheetReadError) as e:
            print(f"  - {name}: {e}")
            continue
        except doc_reader.UnsupportedFormat:
            continue
        except Exception as e:  # 1 file hong khong duoc lam gay ca lan chay
            print(f"  - {name}: lỗi đọc ({str(e)[:100]}), bỏ qua.")
            continue
        if n:
            done.add(source)
            total += n
    print(f"  => nạp mới {len(done) - fresh} tài liệu ({total} chunk), "
          f"giữ nguyên {fresh} tài liệu không đổi.")
    return done


def _prune(job: _Job, keep: set) -> int:
    """Xoa nguon 'Drive: ...' khong con tren Drive (hoac vua bi bo qua). Tra ve so nguon xoa.

    Doi chieu voi job.known (chup luc bat dau, da loc dung project) thay vi hoi lai DB:
    list_sources khong loc project khi project_id = None -> de bao 'gỡ' nham nguon cua
    project khac (roi xoa hut vi delete lai co loc).
    """
    stale = [s for s in job.known if s not in keep]
    for source in sorted(stale):
        repo.delete_by_source(job.client, source, job.project_id)
        print(f"  - gỡ: {source}")
    return len(stale)


def _list_targets(sess, skip: SkipRules) -> tuple:
    """Liet ke Drive -> (files can nap, [(ten, ly do bo qua)], tong so file thay duoc)."""
    print("Đang liệt kê tài liệu trên Drive...", flush=True)
    files = drive.list_documents(sess)
    print(f"  -> tìm thấy {len(files)} file. Lấy tên thư mục cha...", flush=True)
    drive.attach_parents(sess, files)
    kept, dropped = _split_targets(files, skip)
    return kept, dropped, len(files)


def cmd_sync(args):
    skip = SkipRules.from_args(args)
    try:
        sess = drive.make_session(drive.resolve_key(args.key))
        kept, dropped, seen = _list_targets(sess, skip)
    except drive.DriveError as e:
        die(str(e))

    where = f" -> project {args.project}" if args.project else " (tài liệu chung)"
    print(f"Nạp ruột {len(kept)}/{seen} tài liệu{where}{skip.describe()}")
    if dropped:
        print(f"Bỏ qua {len(dropped)} file:")
        for name, reason in dropped:
            print(f"  - {name} ({reason})")
    if not kept:
        die("không còn tài liệu nào sau khi lọc. Đã share folder cho service account chưa?")

    with tempfile.TemporaryDirectory(prefix="drive_rag_") as tmpdir:
        job = _Job(sess, tmpdir, args)  # tai ve thu muc tam, tu xoa khi xong
        done = _ingest(job, kept)

    if args.dry_run:
        print("Xong (dry-run): không nạp gì vào kho.")
        return

    pruned = 0
    if not args.no_prune:
        print("Dọn tài liệu Drive đã gỡ:")
        pruned = _prune(job, done)
    print(f"\nXong: {len(done)} tài liệu Drive trong kho | đã gỡ: {pruned}. "
          f"Hỏi thử: python skills\\doc_search.py \"<câu hỏi về nội dung file>\"")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Nap ruot (noi dung) tai lieu Google Drive vao kho RAG.")
    p.add_argument("--project", help="project_id de gan tai lieu (bo trong = tai lieu chung)")
    p.add_argument("--key", help="Duong dan service account JSON (mac dinh keys/service-account-gsheets.json)")
    # Bo loc chinh nam o settings.json > rag_drive_skip; 2 co duoi chi de THEM tam thoi.
    p.add_argument("--skip-folder", action="append", default=[],
                   help="Bo qua them 1 thu muc Drive (lap lai nhieu lan)")
    p.add_argument("--skip-name", action="append", default=[],
                   help="Bo qua them file co ten CHUA chuoi nay (lap lai nhieu lan)")
    p.add_argument("--no-skip", action="store_true",
                   help="Nap TAT CA: bo moi bo loc (ke ca csv_config va localization)")
    p.add_argument("--no-prune", action="store_true", help="Khong xoa nguon Drive da bi go")
    p.add_argument("--force", action="store_true",
                   help="Nap lai CA tai lieu khong doi (mac dinh chi nap file co sua tren Drive)")
    p.add_argument("--dry-run", action="store_true", help="Chi dem chunk, khong embed/nap")
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
