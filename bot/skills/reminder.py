"""Nhac task tre han + prompt standup. Chay tu Task Scheduler / cron (KHONG qua Claude).

Query Firestore lay task tre han va task den han hom nay, gom theo nguoi, roi
dang tin nhan vao kenh Discord bang bot token truc tiep. Ping nguoi nhan qua
discordId neu co ('<@id>'). Logic query tach rieng khoi phan mang/discord.

Cach dung:
    python reminder.py             # nhac task tre han + den han hom nay
    python reminder.py --standup   # dang cau hoi standup hang ngay
    python reminder.py --dry-run   # in ra man hinh, khong gui Discord
"""

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import discord
from dotenv import load_dotenv

import task_repo as repo
import web_link

# .env va settings.json nam o thu muc bot/ (cha cua skills/).
_BOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BOT_DIR / ".env")
_SETTINGS = json.loads((_BOT_DIR / "settings.json").read_text(encoding="utf-8"))

log = logging.getLogger("reminder")


def die(message: str):
    print(f"LỖI: {message}")
    sys.exit(1)


# --- Phan 1: logic query (thuan Firestore, khong dinh mang) -----------------

def _mention_or_name(client, task, user_cache: dict) -> str:
    """Ping qua <@discordId> neu biet, khong thi dung ten thuong."""
    assignee_id = task.get("assigneeId")
    name = task.get("assigneeName") or "Chưa giao"
    if not assignee_id:
        return name
    if assignee_id not in user_cache:
        user_cache[assignee_id] = repo.get_profile(client, assignee_id) or {}
    discord_id = (user_cache[assignee_id] or {}).get("discordId")
    return f"<@{discord_id}>" if discord_id else name


def build_reminder_message(client, now: datetime) -> str:
    """Ghep noi dung nhac (gom theo nguoi). Chuoi rong neu khong co gi de nhac."""
    overdue, due_today = repo.overdue_and_due_today(client, now)
    if not overdue and not due_today:
        return ""

    user_cache = {}
    lines = ["📋 Nhắc task hằng ngày:"]
    if overdue:
        lines.append(f"⏰ Trễ hạn ({len(overdue)}):")
        lines += _group_lines(client, overdue, user_cache)
    if due_today:
        lines.append(f"📅 Đến hạn hôm nay ({len(due_today)}):")
        lines += _group_lines(client, due_today, user_cache)
    return "\n".join(lines)


def _group_lines(client, tasks, user_cache) -> list:
    """Nhom task theo nguoi nhan -> moi nguoi 1 dong dau + task ben duoi."""
    grouped = {}
    for t in tasks:
        key = _mention_or_name(client, t, user_cache)
        grouped.setdefault(key, []).append(t)

    lines = []
    for mention, items in grouped.items():
        lines.append(f"- {mention}:")
        for t in items:
            lines.append(f"  - [{repo.short_id(t['_id'])}] {t.get('title', '')}")
    return lines


def build_standup_message() -> str:
    """Cau hoi standup hang ngay (co the tuy chinh trong settings.json)."""
    return _SETTINGS.get("standup_prompt") or (
        "🧭 Standup hôm nay! Mọi người trả lời nhanh 3 ý:\n"
        "- Hôm qua làm gì?\n- Hôm nay làm gì?\n- Có vướng mắc gì không?"
    )


def _discord_id(client, user_id, cache: dict):
    """Lay discordId cua 1 user (co cache). None neu khong co user/discordId."""
    if not user_id:
        return None
    if user_id not in cache:
        cache[user_id] = repo.get_profile(client, user_id) or {}
    return (cache[user_id] or {}).get("discordId")


def _sprint_name(client, sprint_id) -> str:
    """Ten sprint tu sprintId; 'backlog' neu null; '?' neu khong tim thay."""
    return repo.sprint_name(client, sprint_id)


def build_done_message(client, task: dict) -> str:
    """Tao thong bao task hoan thanh, chi ping nguoi co discordId.

    Tieng Viet co dau. Assignee duoc khen rieng; reporter + watchers vao 'cc',
    da bo trung id (khong ping 1 nguoi 2 lan).
    """
    cache = {}
    assignee_did = _discord_id(client, task.get("assigneeId"), cache)

    title = task.get("title", "(không tên)")
    sprint = _sprint_name(client, task.get("sprintId"))
    parts = [f'✅ Task đã hoàn thành: "{title}" (sprint {sprint}).']
    if assignee_did:
        parts.append(f"<@{assignee_did}> làm tốt lắm!")

    cc_ids = _cc_discord_ids(client, task, cache, exclude=assignee_did)
    if cc_ids:
        parts.append("cc " + " ".join(f"<@{d}>" for d in cc_ids))
    # Link cuoi cau: bam thang vao task khoi phai tu mo web di tim.
    url = web_link.task_url(task.get("id") or task.get("_id"))
    if url:
        parts.append(url)
    return " ".join(parts)


def _cc_discord_ids(client, task, cache, exclude) -> list:
    """discordId cua reporter + watcherIds: giu thu tu, bo trung va bo 'exclude'."""
    uids = [task.get("reporterId"), *(task.get("watcherIds") or [])]
    seen = {exclude} if exclude else set()
    result = []
    for uid in uids:
        did = _discord_id(client, uid, cache)
        if did and did not in seen:
            seen.add(did)
            result.append(did)
    return result


def notify_done(task_or_id) -> bool:
    """Post thong bao task hoan thanh vao kenh Discord. Best-effort (khong crash).

    task_or_id: dict task hoac task id. Tra ve True neu da gui thanh cong.
    Thieu token/kenh/task -> log canh bao va tra ve False (no-op).
    """
    token = os.getenv("DISCORD_TOKEN")
    if not token:
        log.warning("Thiếu DISCORD_TOKEN, bỏ qua thông báo task hoàn thành.")
        return False
    channel_id = _done_channel_id()
    if not channel_id:
        log.warning("Chưa đặt task_done_channel_id/reminder_channel_id, bỏ qua thông báo.")
        return False

    client = repo.db()
    task = task_or_id if isinstance(task_or_id, dict) else repo.get_task(client, task_or_id)
    if not task:
        log.warning("Không tìm thấy task để thông báo hoàn thành.")
        return False

    content = build_done_message(client, task)
    return post_to_discord(token, channel_id, content) == 0


def _done_channel_id() -> int:
    """Kenh cho thong bao hoan thanh: task_done_channel_id, fallback reminder_channel_id."""
    value = _SETTINGS.get("task_done_channel_id") or _SETTINGS.get("reminder_channel_id")
    return int(value) if value else 0


# --- Phan 2: gui Discord (tach rieng khoi query) ----------------------------

def post_to_discord(token: str, channel_id: int, content: str) -> int:
    """Dang 1 tin nhan vao kenh roi thoat. Tra ve exit code (0 = ok)."""
    intents = discord.Intents.default()
    client = discord.Client(intents=intents)
    state = {"code": 0}

    @client.event
    async def on_ready():
        try:
            channel = client.get_channel(channel_id) or await client.fetch_channel(channel_id)
            await channel.send(
                content=content,
                allowed_mentions=discord.AllowedMentions(users=True),
            )
            print("Đã gửi vào kênh", channel_id)
        except Exception as e:
            print("Lỗi gửi Discord:", e, file=sys.stderr)
            state["code"] = 1
        finally:
            await client.close()

    client.run(token)
    return state["code"]


def _channel_id(standup: bool) -> int:
    """Chon channel theo che do; fail fast neu chua cau hinh trong settings.json."""
    key = "standup_channel_id" if standup else "reminder_channel_id"
    value = _SETTINGS.get(key)
    if not value:
        die(f"chưa đặt '{key}' trong settings.json")
    return int(value)


def main():
    parser = argparse.ArgumentParser(description="Nhac task tre han / standup (scheduler).")
    parser.add_argument("--standup", action="store_true", help="Dang prompt standup")
    parser.add_argument("--dry-run", action="store_true", help="In ra, khong gui")
    args = parser.parse_args()

    if args.standup:
        content = build_standup_message()
    else:
        try:
            content = build_reminder_message(repo.db(), datetime.now(timezone.utc))
        except Exception as e:
            die(f"lỗi truy vấn dữ liệu: {e}")
        if not content:
            print("Không có task trễ hạn / đến hạn hôm nay. Không gửi gì.")
            return

    if args.dry_run:
        print("[DRY RUN]\n" + content)
        return

    token = os.getenv("DISCORD_TOKEN")
    if not token:
        die("thiếu DISCORD_TOKEN trong .env")
    sys.exit(post_to_discord(token, _channel_id(args.standup), content))


if __name__ == "__main__":
    main()
