"""Skill CLI: tim tai lieu lien quan trong kho RAG (Supabase pgvector) bang bge-m3.

Claude goi script nay (o che do an toan, day la skill duy nhat cua RAG duoc phep chay)
khi nguoi dung hoi ve NOI DUNG tai lieu (spec, tai lieu hop, huong dan...).
In cac doan lien quan kem nguon de Claude tong hop tra loi. In 'LOI: ...' khi that bai.

Vi du:
    python doc_search.py "quy trinh release gom nhung buoc nao?"
    python doc_search.py "chinh sach nghi phep" --project 620a1a7d-... --top-k 6
"""

import argparse
import json
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows console -> UTF-8 cho tieng Viet
except Exception:
    pass

import doc_repo as repo
import permissions
from embeddings import EmbeddingError, embed_text

_MAX_SNIPPET = 700  # cat bot moi doan cho gon khi in ra cho Claude
_BOT_DIR = Path(__file__).resolve().parent.parent


def die(message: str):
    print(f"LOI: {message}")
    sys.exit(1)


def _clip(text: str) -> str:
    text = (text or "").strip()
    return text if len(text) <= _MAX_SNIPPET else text[:_MAX_SNIPPET] + " [...]"


def _hidden_sources() -> list:
    """Nguon RAG KHONG duoc gui cho member (settings.json > rag_member_hidden_sources).

    Vd tai lieu noi bo (weekly report): admin/owner van tra cuu duoc, member thi khong.
    Thieu/hong settings.json -> coi nhu khong an gi (fail-open cho tinh nang tim, nhung
    viec chan van fail-closed: khong nhan dien duoc nguoi hoi = coi la member, xem _search).
    """
    try:
        cfg = json.loads((_BOT_DIR / "settings.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return [s.strip() for s in (cfg.get("rag_member_hidden_sources") or []) if s and s.strip()]


def _visible(hits: list, hidden: list, is_admin: bool) -> list:
    """Bo cac doan thuoc nguon an khi nguoi hoi KHONG phai admin. Thuan, de test.

    Khop MOT PHAN, khong phan biet hoa/thuong, doi chieu CA ten nguon (source) lan ten
    muc (section) -> chan ca noi dung ('Drive: <ten>') lan muc danh muc ('Google Drive'
    -> section = <ten file>). Admin/owner: giu nguyen.
    """
    if is_admin or not hidden:
        return hits
    terms = [h.lower() for h in hidden]
    kept = []
    for h in hits:
        haystack = f"{h.get('source', '')} {h.get('section', '')}".lower()
        if any(term in haystack for term in terms):
            continue
        kept.append(h)
    return kept


def cmd_search(args):
    query = (args.query or "").strip()
    if not query:
        die("thiếu câu truy vấn")

    try:
        vector = embed_text(query)
    except EmbeddingError as e:
        die(str(e))

    client = repo.db()
    hidden = _hidden_sources()
    # is_admin cham DB -> chi hoi khi that su co nguon an. Khong co nguon an => coi nhu
    # admin (khong loc gi). Danh tinh lay tu BOT_SENDER_ID (bot.py); khong nhan dien duoc
    # -> is_admin=False -> member -> van an nguon nhay cam (fail-closed).
    is_admin = permissions.is_admin(client) if hidden else True
    # Member phai loc bot nguon an -> lay du rong roi cat, de sau khi bo van con du top-k.
    pool_k = args.top_k if is_admin else max(args.top_k * 4, args.top_k + 30)
    hits = _visible(repo.match(client, vector, project_id=args.project, top_k=pool_k),
                    hidden, is_admin)[:args.top_k]
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
        url = h.get("source_url")
        if url:  # link mo DUNG cho (Google Sheets: dung tab qua #gid) — de bot gui cho nguoi
            print(f"    🔗 {url}")
        print(_clip(h.get("content", "")))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Tim tai lieu lien quan trong kho RAG (bge-m3 + pgvector).")
    parser.add_argument("query", help="Cau hoi / tu khoa can tim trong tai lieu")
    parser.add_argument("--project", help="Loc theo project_id (bo trong = tim moi tai lieu)")
    # 12, khong phai 5: kho ~2k chunk, cac sheet "danh muc" (CSV Collection) day dac tu khoa
    # nen de dan dau va chon lap spec that xuong hang ~9 -> top-5 bo sot. 12 du de spec thuc
    # lot vao ma van gon cho Claude tong hop.
    parser.add_argument("--top-k", type=int, default=12, help="So doan lay ra (mac dinh 12)")
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
