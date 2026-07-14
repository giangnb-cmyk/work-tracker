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

# .env va settings.json nam o thu muc bot/ (cha cua skills/).
_BOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BOT_DIR / ".env")
_SETTINGS = json.loads((_BOT_DIR / "settings.json").read_text(encoding="utf-8"))


def die(message: str):
    print(f"LOI: {message}")
    sys.exit(1)


# --- Phan 1: logic query (thuan Firestore, khong dinh mang) -----------------

def _mention_or_name(client, task, user_cache: dict) -> str:
    """Ping qua <@discordId> neu biet, khong thi dung ten thuong."""
    assignee_id = task.get("assigneeId")
    name = task.get("assigneeName") or "Chua giao"
    if not assignee_id:
        return name
    if assignee_id not in user_cache:
        doc = client.collection(repo.USERS).document(assignee_id).get()
        user_cache[assignee_id] = doc.to_dict() if doc.exists else {}
    discord_id = (user_cache[assignee_id] or {}).get("discordId")
    return f"<@{discord_id}>" if discord_id else name


def build_reminder_message(client, now: datetime) -> str:
    """Ghep noi dung nhac (gom theo nguoi). Chuoi rong neu khong co gi de nhac."""
    overdue, due_today = repo.overdue_and_due_today(client, now)
    if not overdue and not due_today:
        return ""

    user_cache = {}
    lines = ["📋 Nhac task hang ngay:"]
    if overdue:
        lines.append(f"⏰ Tre han ({len(overdue)}):")
        lines += _group_lines(client, overdue, user_cache)
    if due_today:
        lines.append(f"📅 Den han hom nay ({len(due_today)}):")
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
        "🧭 Standup hom nay! Moi nguoi tra loi nhanh 3 y:\n"
        "- Hom qua lam gi?\n- Hom nay lam gi?\n- Co vuong mac gi khong?"
    )


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
            print("Da gui vao kenh", channel_id)
        except Exception as e:
            print("Loi gui Discord:", e, file=sys.stderr)
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
        die(f"chua dat '{key}' trong settings.json")
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
            die(f"loi truy van Firestore: {e}")
        if not content:
            print("Khong co task tre han / den han hom nay. Khong gui gi.")
            return

    if args.dry_run:
        print("[DRY RUN]\n" + content)
        return

    token = os.getenv("DISCORD_TOKEN")
    if not token:
        die("thieu DISCORD_TOKEN trong .env")
    sys.exit(post_to_discord(token, _channel_id(args.standup), content))


if __name__ == "__main__":
    main()
