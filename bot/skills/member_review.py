"""Tổng hợp đánh giá thành viên theo THÁNG/QUÝ từ ghi chú sprint (bảng member_sprint_notes, 0059).

Chạy QUA HÀNG ĐỢI: web (tab Đánh giá) xếp yêu cầu vào member_review_requests, bot.py quét và gọi
skill này. Đây là phần THUẦN dữ liệu + prompt + lưu — phần gọi Claude CLI nằm ở bot.ask_claude_text
(bot mới có cấu hình model/timeout + semaphore). Không đụng Discord.

Web đã tính sẵn period_start/period_end nên skill KHÔNG làm toán ranh giới kỳ; chỉ lấy các sprint
GIAO khoảng đó (start_date <= period_end AND end_date >= period_start — sprint thiếu ngày bị loại tự
nhiên vì lte/gte bỏ qua null).

Chạy tay để xem prompt (không gọi LLM):
    python skills/member_review.py --member <uuid> --start 2026-07-01 --end 2026-07-31 --kind month
"""

from constants import ADMIN_ROLES

RATING_LABEL = {1: "Cần cải thiện", 2: "Dưới kỳ vọng", 3: "Đạt", 4: "Tốt", 5: "Xuất sắc"}

# System prompt riêng cho việc đánh giá — KHÔNG dùng persona Discord/skill của bot.
SYSTEM_PROMPT = (
    "Bạn là quản lý kỹ thuật/nhân sự. Dựa CHỈ trên các ghi chú sprint được cung cấp, viết một bản "
    "đánh giá tổng hợp cho nhân sự theo kỳ. TUYỆT ĐỐI không bịa thông tin ngoài ghi chú; nếu dữ liệu "
    "mỏng thì nói rõ là mỏng. Cấu trúc rõ ràng theo các mục: Tổng quan; Điểm nổi bật; Điểm cần cải "
    "thiện; Xu hướng qua các sprint; Đề xuất cho kỳ tới. Giọng khách quan, xây dựng, tôn trọng. Viết "
    "tiếng Việt có dấu. KHÔNG dùng bảng markdown — dùng gạch đầu dòng cho dễ đọc."
)


def period_label(period_kind: str, period_start: str) -> str:
    """'Tháng 7/2026' / 'Quý 3/2026' từ period_kind + period_start ('YYYY-MM-DD')."""
    y, m, _ = period_start.split("-")
    if period_kind == "quarter":
        return f"Quý {(int(m) - 1) // 3 + 1}/{y}"
    return f"Tháng {int(m)}/{y}"


def _profile(sb, user_id: str):
    if not user_id:
        return None
    rows = sb.table("profiles").select("display_name, role").eq("id", user_id).limit(1).execute().data
    return rows[0] if rows else None


def requester_is_admin(sb, requested_by) -> bool:
    """Phòng thủ nhiều lớp: service-role BỎ QUA RLS nên bot tự kiểm người yêu cầu là admin/owner
    (đúng học thuyết permissions.py). requested_by rỗng → từ chối (fail closed)."""
    p = _profile(sb, requested_by)
    return bool(p and p.get("role") in ADMIN_ROLES)


def member_name(sb, member_id: str) -> str:
    p = _profile(sb, member_id)
    return (p or {}).get("display_name") or "Thành viên"


def _has_content(r: dict) -> bool:
    """Ghi chú CÓ nội dung — ô rỗng hoàn toàn không giúp AI đánh giá, bỏ qua."""
    return bool(r.get("overview") or r.get("highlights") or r.get("concerns") or r.get("rating"))


def fetch_period_notes(sb, member_id: str, period_start: str, period_end: str) -> list:
    """Ghi chú của member trong các sprint GIAO [period_start, period_end], sắp cũ → mới."""
    sprints = (
        sb.table("sprints")
        .select("id, name, start_date, end_date")
        .lte("start_date", period_end)
        .gte("end_date", period_start)
        .execute()
        .data
    ) or []
    by_id = {s["id"]: s for s in sprints}
    if not by_id:
        return []
    rows = (
        sb.table("member_sprint_notes")
        .select("*")
        .eq("member_id", member_id)
        .in_("sprint_id", list(by_id.keys()))
        .execute()
        .data
    ) or []
    out = []
    for r in rows:
        if not _has_content(r):
            continue
        s = by_id.get(r["sprint_id"], {})
        out.append({
            "sprint_name": s.get("name") or "Sprint",
            "start": s.get("start_date"),
            "end": s.get("end_date"),
            "rating": r.get("rating"),
            "overview": r.get("overview") or "",
            "highlights": r.get("highlights") or "",
            "concerns": r.get("concerns") or "",
        })
    out.sort(key=lambda n: n["start"] or "")
    return out


def build_prompt(name: str, label: str, notes: list) -> str:
    """Prompt liệt kê ghi chú từng sprint để Claude tổng hợp (system prompt ở SYSTEM_PROMPT)."""
    blocks = []
    for n in notes:
        rating = n.get("rating")
        rating_txt = f"{rating}/5 ({RATING_LABEL.get(rating, '')})" if rating else "chưa chấm"
        parts = [f"### {n['sprint_name']} ({n['start']} → {n['end']}) — điểm: {rating_txt}"]
        if n["overview"]:
            parts.append(f"- Tổng quan: {n['overview']}")
        if n["highlights"]:
            parts.append(f"- Nổi bật: {n['highlights']}")
        if n["concerns"]:
            parts.append(f"- Cần lưu ý: {n['concerns']}")
        blocks.append("\n".join(parts))
    body = "\n\n".join(blocks)
    return (
        f"Nhân sự: {name}\n"
        f"Kỳ đánh giá: {label}\n"
        f"Số ghi chú sprint: {len(notes)}\n\n"
        f"Các ghi chú theo sprint (cũ → mới):\n\n{body}\n\n"
        f"Hãy viết bản đánh giá tổng hợp {label} cho {name} theo đúng cấu trúc yêu cầu."
    )


def has_existing_review(sb, member_id: str, period_kind: str, period_start: str) -> bool:
    rows = (
        sb.table("member_period_reviews")
        .select("id")
        .eq("member_id", member_id)
        .eq("period_kind", period_kind)
        .eq("period_start", period_start)
        .limit(1)
        .execute()
        .data
    )
    return bool(rows)


def save_review(sb, row: dict) -> None:
    """Upsert kết quả (khoá member_id+period_kind+period_start) — bấm lại là ghi đè bản mới."""
    sb.table("member_period_reviews").upsert(
        row, on_conflict="member_id,period_kind,period_start"
    ).execute()


if __name__ == "__main__":
    import argparse

    from supabase_client import get_client

    ap = argparse.ArgumentParser(description="Xem prompt tong hop danh gia (khong goi LLM).")
    ap.add_argument("--member", required=True, help="member_id (uuid)")
    ap.add_argument("--start", required=True, help="period_start YYYY-MM-DD")
    ap.add_argument("--end", required=True, help="period_end YYYY-MM-DD")
    ap.add_argument("--kind", default="month", choices=["month", "quarter"])
    a = ap.parse_args()

    sb = get_client()
    notes = fetch_period_notes(sb, a.member, a.start, a.end)
    print(f"{len(notes)} ghi chu trong ky.")
    if notes:
        label = period_label(a.kind, a.start)
        print("\n--- SYSTEM ---\n" + SYSTEM_PROMPT)
        print("\n--- PROMPT ---\n" + build_prompt(member_name(sb, a.member), label, notes))
