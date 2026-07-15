"""Dong bo bug tu 1 kenh Forum Discord vao bang `bugs` (Supabase).

Moi bai post (thread) trong forum -> 1 bug:
  - tieu de thread      -> title
  - tin nhan dau thread -> description
  - forum tags          -> bug_labels (tu tao neu chua co, khop theo ten)
  - nguoi tao thread     -> reporter (khop profiles.discord_id)

Upsert theo `discord_thread_id`: bug da co thi CHI cap nhat noi dung (title/mo ta/
nhan/reporter), GIU NGUYEN status + assignee da chinh trong app (kanban khong bi reset).

Nhap khau:
  - bot.py goi `sync_forum(client, sb, project_id, forum_channel_id)` bang client dang chay.
  - Hoac chay doc lap: `python skills/bug_sync.py` (mo 1 client ngan, sync roi thoat)
    de Task Scheduler goi neu khong muon dua vao tien trinh bot always-on.
"""

import asyncio
import json
import logging
import os
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import discord
from dotenv import load_dotenv

# WHY: khi chay standalone thi bot/ khong nam tren sys.path -> them vao (giong task_repo).
_BOT_DIR = Path(__file__).resolve().parent.parent
if str(_BOT_DIR) not in sys.path:
    sys.path.insert(0, str(_BOT_DIR))

from supabase_client import get_client  # noqa: E402
from constants import _fold  # noqa: E402

load_dotenv(_BOT_DIR / ".env")
_SETTINGS = json.loads((_BOT_DIR / "settings.json").read_text(encoding="utf-8"))

log = logging.getLogger("bug_sync")

BUGS = "bugs"
BUG_LABELS = "bug_labels"
PROFILES = "profiles"


def load_forum_configs() -> list[dict]:
    """Danh sach {project_id, forum_channel_id} tu settings.json['bug_forums']."""
    out = []
    for c in _SETTINGS.get("bug_forums") or []:
        pid = c.get("project_id")
        fid = c.get("forum_channel_id")
        if pid and fid:
            out.append({"project_id": str(pid), "forum_channel_id": int(fid)})
    return out


def forum_for_project(project_id: str) -> dict | None:
    """Cau hinh forum ung voi 1 project (hoac cau hinh duy nhat neu chi co 1)."""
    configs = load_forum_configs()
    for c in configs:
        if c["project_id"] == str(project_id):
            return c
    return configs[0] if len(configs) == 1 else None


# --- Doc forun (async, can discord client) ---------------------------------

def _emoji_str(emoji) -> str:
    """Emoji unicode cua forum tag -> str. Bo qua custom emoji (co .id)."""
    if not emoji or getattr(emoji, "id", None):
        return ""
    s = str(emoji)
    return s if len(s) <= 4 else ""


def _thread_tags(thread, tag_by_id) -> list[tuple[str, str]]:
    """Danh sach (ten_tag, emoji) da ap cho thread."""
    out = []
    for tag in getattr(thread, "applied_tags", None) or []:
        name = getattr(tag, "name", None)
        emoji = getattr(tag, "emoji", None)
        if name is None:  # phong ho ban discord.py cu tra ve id
            ft = tag_by_id.get(tag)
            if not ft:
                continue
            name, emoji = ft.name, ft.emoji
        out.append((name, _emoji_str(emoji)))
    return out


async def _read_forum(client, forum_channel_id: int) -> list[dict]:
    """Doc moi thread (active + archived) cua forum -> list dict tho."""
    ch = client.get_channel(forum_channel_id) or await client.fetch_channel(forum_channel_id)
    if not isinstance(ch, discord.ForumChannel):
        raise RuntimeError(f"channel {forum_channel_id} khong phai Forum channel")

    tag_by_id = {t.id: t for t in ch.available_tags}
    threads = list(ch.threads)
    try:
        async for t in ch.archived_threads(limit=None):
            threads.append(t)
    except Exception as e:  # thieu quyen doc archived -> chi lay active
        log.warning("Khong doc duoc archived threads cua %s: %s", forum_channel_id, e)

    items = []
    for t in threads:
        desc, author = "", None
        try:
            starter = t.starter_message or await t.fetch_message(t.id)
            if starter:
                desc = starter.content or ""
                author = starter.author
        except Exception:
            pass  # thread rong / tin nhan goc bi xoa -> mo ta rong
        owner_id = getattr(t, "owner_id", None) or (author.id if author else None)
        items.append({
            "thread_id": str(t.id),
            "title": (t.name or "(khong tieu de)")[:200],
            "description": desc,
            "owner_id": str(owner_id) if owner_id else "",
            "author_name": (author.display_name if author else "") or "Discord",
            "tags": _thread_tags(t, tag_by_id),
        })
    return items


# --- Ghi Supabase (blocking; goi qua asyncio.to_thread) ---------------------

def _profiles_by_discord(sb) -> dict:
    """discord_id (str) -> (profile_id, display_name)."""
    m = {}
    for r in sb.table(PROFILES).select("id,discord_id,display_name").execute().data:
        did = r.get("discord_id")
        if did:
            m[str(did)] = (r["id"], r.get("display_name") or "")
    return m


def _ensure_labels(sb, project_id: str, specs: list[tuple[str, str]]) -> dict:
    """Tim-hoac-tao bug_labels theo ten (khong phan biet hoa/dau). Tra ve {ten: id}."""
    existing = sb.table(BUG_LABELS).select("id,name").eq("project_id", project_id).execute().data
    by_fold = {_fold(r["name"]): r["id"] for r in existing}

    to_create, queued = [], set()
    for name, emoji in specs:
        key = _fold(name)
        if key in by_fold or key in queued:
            continue
        queued.add(key)
        to_create.append({"project_id": project_id, "name": name, "color": "#6366f1", "icon": emoji or ""})
    if to_create:
        created = sb.table(BUG_LABELS).insert(to_create).execute().data
        for r in created:
            by_fold[_fold(r["name"])] = r["id"]

    return {name: by_fold.get(_fold(name)) for name, _ in specs}


def _upsert_bugs(sb, project_id: str, items: list[dict]) -> dict:
    """Upsert bug theo discord_thread_id. Giu status/assignee cua bug da ton tai."""
    labelmap = _ensure_labels(sb, project_id, [t for it in items for t in it["tags"]])
    profiles = _profiles_by_discord(sb)

    existing = sb.table(BUGS).select("id,discord_thread_id").eq("project_id", project_id).execute().data
    by_thread = {r["discord_thread_id"]: r["id"] for r in existing if r.get("discord_thread_id")}

    created = updated = 0
    for it in items:
        label_ids = []
        for name, _ in it["tags"]:
            lid = labelmap.get(name)
            if lid and lid not in label_ids:
                label_ids.append(lid)
        rep = profiles.get(it["owner_id"])
        reporter_id = rep[0] if rep else None
        reporter_name = rep[1] if rep else it["author_name"]

        tid = it["thread_id"]
        if tid in by_thread:
            sb.table(BUGS).update({
                "title": it["title"], "description": it["description"],
                "label_ids": label_ids, "reporter_id": reporter_id, "reporter_name": reporter_name,
            }).eq("id", by_thread[tid]).execute()
            updated += 1
        else:
            sb.table(BUGS).insert({
                "project_id": project_id, "title": it["title"], "description": it["description"],
                "status": "open", "label_ids": label_ids,
                "reporter_id": reporter_id, "reporter_name": reporter_name,
                "discord_thread_id": tid,
            }).execute()
            created += 1
    return {"created": created, "updated": updated, "total": len(items)}


# --- Entry points ----------------------------------------------------------

async def sync_forum(client, sb, project_id: str, forum_channel_id: int) -> dict:
    """Doc forum roi upsert vao bugs. Tra ve {created, updated, total}."""
    items = await _read_forum(client, forum_channel_id)
    return await asyncio.to_thread(_upsert_bugs, sb, project_id, items)


async def sync_all(client, sb) -> list[tuple[dict, dict]]:
    """Sync moi forum trong cau hinh. Tra ve [(config, result), ...]."""
    results = []
    for cfg in load_forum_configs():
        try:
            r = await sync_forum(client, sb, cfg["project_id"], cfg["forum_channel_id"])
        except Exception as e:
            log.exception("Sync forum %s that bai", cfg["forum_channel_id"])
            r = {"error": str(e)}
        results.append((cfg, r))
    return results


def run_once() -> int:
    """Standalone: mo 1 client ngan, sync tat ca forum, roi thoat. (Task Scheduler)."""
    token = os.getenv("DISCORD_TOKEN")
    if not token:
        print("LOI: thieu DISCORD_TOKEN trong .env", file=sys.stderr)
        return 1
    if not load_forum_configs():
        print("Chua cau hinh 'bug_forums' trong settings.json. Khong co gi de sync.")
        return 0

    sb = get_client()
    intents = discord.Intents.default()
    intents.message_content = True
    client = discord.Client(intents=intents)
    state = {"results": [], "code": 0}

    @client.event
    async def on_ready():
        try:
            state["results"] = await sync_all(client, sb)
        except Exception as e:
            print("LOI sync:", e, file=sys.stderr)
            state["code"] = 1
        finally:
            await client.close()

    client.run(token)
    for cfg, r in state["results"]:
        if "error" in r:
            print(f"Forum {cfg['forum_channel_id']}: LOI {r['error']}")
        else:
            print(f"Forum {cfg['forum_channel_id']}: tao {r['created']}, cap nhat {r['updated']} (tong {r['total']})")
    return state["code"]


if __name__ == "__main__":
    sys.exit(run_once())
