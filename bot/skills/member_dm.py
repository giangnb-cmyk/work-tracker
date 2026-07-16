"""DM riêng từng member: task đã xong trong tuần + task tồn đọng + câu động viên.

Chạy tự động trong bot.py (mặc định THỨ 5 hằng tuần — settings.json > member_dm) hoặc
chạy tay từ CLI / qua Claude. Logic thống kê tách khỏi phần gửi Discord (giống reminder.py).

Định nghĩa số liệu:
  - "Đã hoàn thành": task chuyển sang done TỪ THỨ 2 00:00 (giờ VN) tuần này, đếm qua
    bảng `activity` (trigger tasks_log_status) — chỉ có dữ liệu từ khi áp migration 0007.
    Task done xong bị mở lại (status hiện tại != done) thì không tính.
  - "Tồn đọng": task có assignee mà chưa done, mọi sprint + backlog; đếm kèm số trễ hạn.

Chỉ DM người có `profiles.discord_id` VÀ có ít nhất 1 task liên quan trong tuần; người
chưa link Discord vẫn hiện trong log để admin biết đường bổ sung. Member tắt DM từ
người lạ trong server sẽ gửi lỗi Forbidden — báo trong log, không làm hỏng cả lượt.

Cách dùng (chạy trong thư mục bot/):
    python skills/member_dm.py --dry-run           # xem trước nội dung, không gửi
    python skills/member_dm.py                     # gửi thật (ADMIN)
    python skills/member_dm.py --member "Nam"      # chỉ gửi cho 1 người (ADMIN)
"""

import argparse
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import discord
from dotenv import load_dotenv

import permissions
import task_repo as repo
from constants import STATUS_DONE
from errors import PermissionDenied

_BOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BOT_DIR / ".env")
_SETTINGS = json.loads((_BOT_DIR / "settings.json").read_text(encoding="utf-8"))

MAX_LISTED_TASKS = 5  # DM chi liet ke toi da ngan nay task ton dong, con lai gom "…"

# Cau dong vien: chon theo TINH HINH (het viec / dang chay tot / chua xong gi),
# random on dinh theo (ngay, nguoi) — cung ky thuat voi today_mood trong bot.py.
_CHEER_ALL_CLEAR = (
    "Sạch bảng luôn, đỉnh thật sự! Giữ phong độ này nhé 🎉",
    "Không còn task tồn — tuyệt vời, cuối tuần thảnh thơi rồi 🏖️",
    "Gọn gàng quá! Team cần thêm nhiều tuần như thế này của bạn 👏",
)
_CHEER_ON_TRACK = (
    "Tiến độ ổn lắm, dồn thêm chút nữa là gọn sổ tuần này 💪",
    "Làm tốt lắm! Ráng xử nốt mấy task còn lại, sắp cuối tuần rồi 🚀",
    "Nhịp này ngon rồi — mỗi ngày một task là bảng sạch ngay 🔥",
)
_CHEER_PUSH = (
    "Tuần này hơi bận nhỉ? Chọn 1 task nhỏ làm đà, xong cái đầu tiên là cuốn ngay 💪",
    "Còn 2 ngày để bứt tốc — cố lên, có gì vướng cứ hú team hỗ trợ nhé 🚀",
    "Vạn sự khởi đầu nan — xử 1 task hôm nay thôi là thấy khác liền 🌱",
)


def die(message: str):
    print(f"LỖI: {message}")
    sys.exit(1)


# --- Phần 1: thống kê (thuần Supabase, không đụng mạng Discord) ---------------

def _tzinfo():
    """Timezone của team (dùng chung bug_sync_tz). Thiếu tzdata -> UTC xấp xỉ."""
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo(_SETTINGS.get("bug_sync_tz", "Asia/Ho_Chi_Minh"))
    except Exception:
        return timezone.utc


def week_start(now: datetime) -> datetime:
    """Thứ 2 00:00 của tuần chứa `now` (giữ nguyên tz của `now`)."""
    monday = now - timedelta(days=now.weekday())
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


def _pick_cheer(done: int, pending: int, seed: str) -> str:
    if pending == 0:
        pool = _CHEER_ALL_CLEAR
    elif done > 0:
        pool = _CHEER_ON_TRACK
    else:
        pool = _CHEER_PUSH
    return pool[int(hashlib.md5(seed.encode()).hexdigest(), 16) % len(pool)]


def _pending_sorted(tasks: list) -> list:
    """Task tồn đọng: trễ hạn trước, rồi hạn gần nhất; chưa có hạn xuống cuối."""
    far_future = datetime.max.replace(tzinfo=timezone.utc)

    def _due(t):
        raw = t.get("dueDate")
        return repo._as_datetime(raw) if raw else far_future

    return sorted(tasks, key=_due)


def build_message(name: str, done: int, pending_tasks: list, overdue: int,
                  now: datetime) -> str:
    """Nội dung DM tiếng Việt cho 1 member. Chuỗi ping/emoji giữ Discord-friendly."""
    pending = len(pending_tasks)
    lines = [f"👋 Chào {name}! Điểm nhanh task tuần này của bạn nè:"]
    lines.append(f"✅ Đã hoàn thành: **{done}** task")
    tail = f" (trong đó ⏰ {overdue} task trễ hạn)" if overdue else ""
    lines.append(f"📌 Còn tồn đọng: **{pending}** task{tail}")
    for t in _pending_sorted(pending_tasks)[:MAX_LISTED_TASKS]:
        lines.append(f"- [{repo.short_id(t['_id'])}] {t.get('title', '')}")
    if pending > MAX_LISTED_TASKS:
        lines.append(f"…và {pending - MAX_LISTED_TASKS} task khác trên bảng nhé.")
    seed = f"{now.date().isoformat()}:{name}"
    lines.append(_pick_cheer(done, pending, seed))
    return "\n".join(lines)


def _stats_by_member(client, now: datetime) -> dict:
    """{assigneeId -> {'done': n, 'pending': [task...], 'overdue': n}}."""
    since = week_start(now).isoformat()
    done_tasks = [
        t for t in repo.tasks_by_ids(client, repo.done_task_ids_since(client, since))
        if t.get("status") == STATUS_DONE and t.get("assigneeId")
    ]
    stats: dict = {}

    def _entry(uid):
        return stats.setdefault(uid, {"done": 0, "pending": [], "overdue": 0})

    for t in done_tasks:
        _entry(t["assigneeId"])["done"] += 1
    for t in repo.open_assigned_tasks(client):
        entry = _entry(t["assigneeId"])
        entry["pending"].append(t)
        due = t.get("dueDate")
        if due and repo._as_datetime(due) < now:
            entry["overdue"] += 1
    return stats


def _to_summary(profile: dict, uid: str, s: dict, now: datetime, test: bool = False) -> dict:
    """Gộp profile + số liệu thành 1 dòng summary sẵn nội dung DM."""
    name = profile.get("displayName") or "bạn"
    message = build_message(name, s["done"], s["pending"], s["overdue"], now)
    if test:
        message = "🧪 (Tin nhắn TEST do admin gửi từ web — số liệu là thật)\n" + message
    return {
        "uid": uid,
        "displayName": name,
        "discordId": profile.get("discordId"),
        "done": s["done"],
        "pending": len(s["pending"]),
        "overdue": s["overdue"],
        "message": message,
    }


def build_summaries(client, now: datetime | None = None) -> list:
    """Mỗi member 1 dict: {uid, displayName, discordId, done, pending, overdue, message}.

    Chỉ gồm người có ít nhất 1 task done-trong-tuần hoặc tồn đọng. discordId có thể
    None (chưa link) — phần gửi sẽ bỏ qua nhưng vẫn báo trong log.
    """
    now = now or datetime.now(_tzinfo())
    summaries = []
    for uid, s in _stats_by_member(client, now).items():
        profile = repo.get_profile(client, uid) or {}
        summaries.append(_to_summary(profile, uid, s, now))
    summaries.sort(key=lambda x: x["displayName"])
    return summaries


def summary_for(client, uid: str, now: datetime | None = None, test: bool = False) -> dict:
    """Summary của ĐÚNG 1 người — đường 'Gửi test' từ web (member_dm_requests).

    Khác build_summaries: người không có task nào vẫn được soạn tin, để admin test
    được đường gửi DM bất kể dữ liệu tuần này.
    """
    now = now or datetime.now(_tzinfo())
    profile = repo.get_profile(client, uid)
    if not profile:
        raise ValueError(f"không tìm thấy profile {uid}")
    s = _stats_by_member(client, now).get(uid) or {"done": 0, "pending": [], "overdue": 0}
    return _to_summary(profile, uid, s, now, test=test)


# --- Phần 2: gửi DM (tách riêng khỏi thống kê) --------------------------------

async def send_dms(discord_client, summaries: list) -> list:
    """DM từng người bằng client đang chạy. Trả về log từng dòng; lỗi 1 người không
    làm hỏng cả lượt (Forbidden = member chặn DM từ server)."""
    lines = []
    for s in summaries:
        did = s.get("discordId")
        label = f"{s['displayName']} ({s['done']} xong / {s['pending']} tồn)"
        if not did:
            lines.append(f"- {label}: chưa link Discord ID, bỏ qua")
            continue
        try:
            user = discord_client.get_user(int(did)) or await discord_client.fetch_user(int(did))
            await user.send(s["message"])
            lines.append(f"- {label}: đã gửi DM")
        except discord.Forbidden:
            lines.append(f"- {label}: bị chặn DM (member tắt tin nhắn riêng?)")
        except Exception as e:
            lines.append(f"- {label}: lỗi gửi ({str(e)[:80]})")
    return lines or ["- Không có member nào cần nhắn tuần này."]


def send_standalone(token: str, summaries: list) -> list:
    """Chạy CLI không có bot đang sống: mở client tạm, gửi xong tự đóng."""
    intents = discord.Intents.default()
    dc = discord.Client(intents=intents)
    result = {"lines": []}

    @dc.event
    async def on_ready():
        try:
            result["lines"] = await send_dms(dc, summaries)
        except Exception as e:
            result["lines"] = [f"- Lỗi gửi DM: {str(e)[:200]}"]
        finally:
            await dc.close()

    dc.run(token)
    return result["lines"]


# --- Entry --------------------------------------------------------------------

def _filter_member(client, summaries: list, token: str) -> list:
    """--member <tên|@mention>: giữ lại đúng 1 người."""
    user = repo.resolve_user(client, token)
    if not user:
        die(f"không tìm thấy member '{token}'")
    kept = [s for s in summaries if s["uid"] == user["_id"]]
    if not kept:
        die(f"{user.get('displayName')} không có task nào trong tuần để nhắn")
    return kept


def main():
    import os

    parser = argparse.ArgumentParser(description="DM diem tuan (task xong/ton dong) cho member.")
    parser.add_argument("--member", default=None, help="Chi gui cho 1 nguoi (ten/mention/uid)")
    parser.add_argument("--dry-run", action="store_true", help="In noi dung, khong gui")
    args = parser.parse_args()

    client = repo.db()
    try:
        summaries = build_summaries(client)
    except Exception as e:
        die(f"lỗi truy vấn dữ liệu: {e}")
    if args.member:
        summaries = _filter_member(client, summaries, args.member)
    if not summaries:
        print("Không có member nào có task trong tuần. Không gửi gì.")
        return

    if args.dry_run:
        for s in summaries:
            target = f"<@{s['discordId']}>" if s.get("discordId") else "(chưa link Discord)"
            print(f"[DRY RUN] {s['displayName']} {target}\n{s['message']}\n")
        return

    try:
        # DM hang loat toi ca team -> chi admin duoc bam nut that.
        permissions.require_admin(client, "gửi DM điểm tuần cho member")
    except PermissionDenied as e:
        die(str(e))
    token = os.getenv("DISCORD_TOKEN")
    if not token:
        die("thiếu DISCORD_TOKEN trong .env")
    for line in send_standalone(token, summaries):
        print(line)


if __name__ == "__main__":
    main()
