"""Dong bo HAI CHIEU giua 1 kenh Forum Discord va bang `bugs` (Supabase).

Discord -> app (khi sync / 9h sang / bam nut):
  - moi bai post (thread) -> 1 bug (title, mo ta = tin dau, reporter theo discord_id)
  - forum tags (available_tags) -> bug_labels, LIEN KET theo discord_tag_id (khong chi theo ten)
  - applied_tags cua thread -> bug.label_ids
  - GIU status/assignee da chinh trong app; upsert theo discord_thread_id

app -> Discord (bot day dinh ky qua push_pending):
  - bug co pending_discord_push=true (nguoi dung doi nhan tren app) -> set lai
    applied_tags cua thread cho khop. Nhan app chua co forum tag se duoc tao moi.
  - trong luc pending, sync Discord->app KHONG ghi de label cua bug do (app thang).

Chay: bot.py goi truc tiep; hoac `python skills/bug_sync.py` (mo client ngan).
"""

import asyncio
import json
import logging
import os
import sys
from collections import defaultdict
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import discord
from dotenv import load_dotenv

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
MAX_APPLIED_TAGS = 5   # Discord: 1 bai forum toi da 5 tag
MAX_TAG_NAME = 20      # Discord: ten forum tag toi da 20 ky tu


def load_forum_configs() -> list[dict]:
    """Danh sach {project_id, forum_channel_id} tu settings.json['bug_forums']."""
    out = []
    for c in _SETTINGS.get("bug_forums") or []:
        pid, fid = c.get("project_id"), c.get("forum_channel_id")
        if pid and fid:
            out.append({"project_id": str(pid), "forum_channel_id": int(fid)})
    return out


def forum_for_project(project_id: str) -> dict | None:
    configs = load_forum_configs()
    for c in configs:
        if c["project_id"] == str(project_id):
            return c
    return configs[0] if len(configs) == 1 else None


# --- Doc forum (async) ------------------------------------------------------

def _emoji_str(emoji) -> str:
    """Emoji unicode -> str; bo qua custom emoji (co .id)."""
    if not emoji or getattr(emoji, "id", None):
        return ""
    s = str(emoji)
    return s if len(s) <= 4 else ""


async def _get_forum(client, forum_channel_id: int):
    ch = client.get_channel(forum_channel_id) or await client.fetch_channel(forum_channel_id)
    if not isinstance(ch, discord.ForumChannel):
        raise RuntimeError(f"channel {forum_channel_id} khong phai Forum channel")
    return ch


async def _read_forum(client, forum_channel_id: int):
    """Tra ve (items, available) — items = threads da chuan hoa; available = [(tag_id, name, emoji)]."""
    ch = await _get_forum(client, forum_channel_id)
    available = [(str(t.id), t.name, _emoji_str(t.emoji)) for t in ch.available_tags]

    threads = list(ch.threads)
    try:
        async for t in ch.archived_threads(limit=None):
            threads.append(t)
    except Exception as e:
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
            pass
        owner_id = getattr(t, "owner_id", None) or (author.id if author else None)
        applied = [str(tag.id) for tag in (getattr(t, "applied_tags", None) or []) if getattr(tag, "id", None)]
        items.append({
            "thread_id": str(t.id),
            "title": (t.name or "(khong tieu de)")[:200],
            "description": desc,
            "owner_id": str(owner_id) if owner_id else "",
            "author_name": (author.display_name if author else "") or "Discord",
            "applied_tag_ids": applied,
        })
    return items, available


# --- Ghi Supabase (blocking; goi qua asyncio.to_thread) ---------------------

def _profiles_by_discord(sb) -> dict:
    m = {}
    for r in sb.table(PROFILES).select("id,discord_id,display_name").execute().data:
        did = r.get("discord_id")
        if did:
            m[str(did)] = (r["id"], r.get("display_name") or "")
    return m


def _sync_palette(sb, project_id: str, available: list[tuple[str, str, str]]) -> dict:
    """Mirror forum tags -> bug_labels, lien ket theo discord_tag_id. Tra ve {tag_id: label_id}."""
    rows = sb.table(BUG_LABELS).select("id,name,icon,discord_tag_id").eq("project_id", project_id).execute().data
    by_tag = {r["discord_tag_id"]: r for r in rows if r.get("discord_tag_id")}
    by_fold = {_fold(r["name"]): r for r in rows}

    tag_to_label, to_create = {}, []
    for tid, name, emoji in available:
        if tid in by_tag:
            lab = by_tag[tid]
            tag_to_label[tid] = lab["id"]
            if lab.get("name") != name:  # forum doi ten tag -> cap nhat nhan
                sb.table(BUG_LABELS).update({"name": name}).eq("id", lab["id"]).execute()
        elif _fold(name) in by_fold:
            lab = by_fold[_fold(name)]  # co nhan cung ten -> lien ket vao forum tag
            patch = {"discord_tag_id": tid}
            if emoji and not lab.get("icon"):
                patch["icon"] = emoji
            sb.table(BUG_LABELS).update(patch).eq("id", lab["id"]).execute()
            tag_to_label[tid] = lab["id"]
        else:
            to_create.append((tid, name, emoji))

    if to_create:
        created = sb.table(BUG_LABELS).insert([
            {"project_id": project_id, "name": n, "color": "#6366f1", "icon": e or "", "discord_tag_id": tid}
            for tid, n, e in to_create
        ]).execute().data
        for r in created:
            if r.get("discord_tag_id"):
                tag_to_label[r["discord_tag_id"]] = r["id"]
    return tag_to_label


def _upsert_bugs(sb, project_id: str, items: list[dict], available: list) -> dict:
    tag_to_label = _sync_palette(sb, project_id, available)
    profiles = _profiles_by_discord(sb)

    existing = sb.table(BUGS).select("id,discord_thread_id,pending_discord_push") \
        .eq("project_id", project_id).execute().data
    by_thread = {r["discord_thread_id"]: r for r in existing if r.get("discord_thread_id")}

    created = updated = 0
    for it in items:
        label_ids = []
        for tid in it["applied_tag_ids"]:
            lid = tag_to_label.get(tid)
            if lid and lid not in label_ids:
                label_ids.append(lid)
        rep = profiles.get(it["owner_id"])
        reporter_id = rep[0] if rep else None
        reporter_name = rep[1] if rep else it["author_name"]

        key = it["thread_id"]
        if key in by_thread:
            row = by_thread[key]
            patch = {"title": it["title"], "description": it["description"],
                     "reporter_id": reporter_id, "reporter_name": reporter_name}
            # App vua doi nhan (chua push) -> KHONG ghi de label; cho push xong da.
            if not row.get("pending_discord_push"):
                patch["label_ids"] = label_ids
            sb.table(BUGS).update(patch).eq("id", row["id"]).execute()
            updated += 1
        else:
            sb.table(BUGS).insert({
                "project_id": project_id, "title": it["title"], "description": it["description"],
                "status": "open", "label_ids": label_ids,
                "reporter_id": reporter_id, "reporter_name": reporter_name,
                "discord_thread_id": key,
            }).execute()
            created += 1
    return {"created": created, "updated": updated, "total": len(items)}


# --- Entry points -----------------------------------------------------------

async def sync_forum(client, sb, project_id: str, forum_channel_id: int) -> dict:
    """Discord -> app: doc forum roi upsert vao bugs."""
    items, available = await _read_forum(client, forum_channel_id)
    return await asyncio.to_thread(_upsert_bugs, sb, project_id, items, available)


async def sync_all(client, sb) -> list[tuple[dict, dict]]:
    results = []
    for cfg in load_forum_configs():
        try:
            r = await sync_forum(client, sb, cfg["project_id"], cfg["forum_channel_id"])
        except Exception as e:
            log.exception("Sync forum %s that bai", cfg["forum_channel_id"])
            r = {"error": str(e)}
        results.append((cfg, r))
    return results


async def push_pending(client, sb) -> int:
    """app -> Discord: day nhung bug co pending_discord_push=true len forum thread."""
    rows = await asyncio.to_thread(
        lambda: sb.table(BUGS).select("id,project_id,discord_thread_id,label_ids")
        .eq("pending_discord_push", True).execute().data
    )
    if not rows:
        return 0

    by_proj = defaultdict(list)
    for r in rows:
        if r.get("discord_thread_id"):
            by_proj[r["project_id"]].append(r)
        else:  # bug app-only: khong co thread de day -> xoa co
            await asyncio.to_thread(
                lambda rid=r["id"]: sb.table(BUGS).update({"pending_discord_push": False}).eq("id", rid).execute()
            )

    pushed = 0
    for pid, bugs in by_proj.items():
        cfg = forum_for_project(pid)
        if not cfg:
            continue
        try:
            ch = await _get_forum(client, cfg["forum_channel_id"])
        except Exception as e:
            log.warning("push: khong lay duoc forum %s: %s", cfg["forum_channel_id"], e)
            continue
        labelrows = await asyncio.to_thread(
            lambda: sb.table(BUG_LABELS).select("id,name,icon,discord_tag_id").eq("project_id", pid).execute().data
        )
        label_info = {r["id"]: r for r in labelrows}
        avail = {str(t.id): t for t in ch.available_tags}
        for b in bugs:
            try:
                await _push_one(client, sb, ch, avail, label_info, b)
                pushed += 1
            except Exception:
                log.exception("push bug %s that bai", b.get("id"))
    return pushed


async def _push_one(client, sb, ch, avail: dict, label_info: dict, bug: dict) -> None:
    tag_objs = []
    for lid in (bug.get("label_ids") or []):
        info = label_info.get(lid)
        if not info:
            continue
        dtid = info.get("discord_tag_id")
        if not dtid:  # nhan tao trong app chua co forum tag -> tao moi
            emoji = info.get("icon") or ""
            partial = discord.PartialEmoji(name=emoji) if emoji else None
            try:
                new_tag = await ch.create_tag(name=(info["name"] or "tag")[:MAX_TAG_NAME], emoji=partial)
            except Exception as e:
                log.warning("Khong tao duoc forum tag '%s': %s", info.get("name"), e)
                continue
            dtid = str(new_tag.id)
            avail[dtid] = new_tag
            info["discord_tag_id"] = dtid
            await asyncio.to_thread(
                lambda tid=dtid, i=lid: sb.table(BUG_LABELS).update({"discord_tag_id": tid}).eq("id", i).execute()
            )
        tag = avail.get(dtid)
        if tag and tag not in tag_objs:
            tag_objs.append(tag)

    tid = int(bug["discord_thread_id"])
    thread = ch.get_thread(tid) or await client.fetch_channel(tid)
    await thread.edit(applied_tags=tag_objs[:MAX_APPLIED_TAGS])
    await asyncio.to_thread(
        lambda: sb.table(BUGS).update({"pending_discord_push": False}).eq("id", bug["id"]).execute()
    )


def run_once() -> int:
    """Standalone: mo 1 client ngan, sync (2 chieu) tat ca forum, roi thoat."""
    token = os.getenv("DISCORD_TOKEN")
    if not token:
        print("LOI: thieu DISCORD_TOKEN trong .env", file=sys.stderr)
        return 1
    if not load_forum_configs():
        print("Chua cau hinh 'bug_forums' trong settings.json.")
        return 0

    sb = get_client()
    intents = discord.Intents.default()
    intents.message_content = True
    client = discord.Client(intents=intents)
    state = {"results": [], "code": 0}

    @client.event
    async def on_ready():
        try:
            await push_pending(client, sb)          # day thay doi app -> Discord truoc
            state["results"] = await sync_all(client, sb)  # roi keo Discord -> app
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
