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
import re
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
STORAGE_BUCKET = "attachments"
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # >50MB: giu link Discord (co the het han) thay vi tai len
# Video an dung luong (uoc tinh forum ~1GB video) -> mac dinh KHONG mirror video.
# Xem video qua nut "Mo Discord". Bat len neu da nang Supabase Pro.
MIRROR_VIDEOS = bool(_SETTINGS.get("bug_mirror_videos", False))
_IMG_EXT = {"png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "svg"}
_VID_EXT = {"mp4", "mov", "webm", "mkv", "avi", "m4v"}


def _att_kind(content_type: str | None, filename: str) -> str:
    ct = (content_type or "").lower()
    if ct.startswith("image/"):
        return "image"
    if ct.startswith("video/"):
        return "video"
    ext = (filename or "").lower().rsplit(".", 1)[-1]
    if ext in _IMG_EXT:
        return "image"
    if ext in _VID_EXT:
        return "video"
    return "file"


def _safe_name(name: str) -> str:
    return re.sub(r"[^\w.-]", "_", name or "file")[:80]


def _thread_created_at(t) -> str | None:
    """Luc bai post duoc TAO tren Discord (UTC, ISO) - moc that cua cai bug do.

    Khong co ham nay thi cot `created_at` roi ve `default now()` cua Postgres, tuc la
    ngay BOT SYNC chu khong phai ngay bao bug: bug post thang 3 sync thang 7 se hien
    la thang 7.

    `Thread.created_at` chi ton tai voi thread tao sau 09/01/2022 (Discord moi them
    truong nay), nen lui ve snowflake cua thread id - id sinh ra dung luc post, va voi
    bai forum thi thread id == id tin nhan dau, nen hai nguon luon khop.
    """
    at = getattr(t, "created_at", None)
    if at is None:
        try:
            at = discord.utils.snowflake_time(t.id)
        except Exception:
            return None
    return at.isoformat()

# Tag workflow -> cot kanban (status). Uu tien: giai doan sau thang.
_STATUS_PRECEDENCE = ["done", "deployed", "pending", "fixing"]


def _status_from_label_names(names: list[str]) -> str:
    """Suy ra status tu ten cac nhan da gan (khong khop -> 'open')."""
    lowered = {(n or "").strip().lower() for n in names}
    for s in _STATUS_PRECEDENCE:
        if s in lowered:
            return s
    return "open"


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
    """Icon cua forum tag: emoji unicode -> ky tu; custom emoji -> URL anh CDN."""
    if not emoji:
        return ""
    if getattr(emoji, "id", None):  # custom emoji -> anh (hien giong het Discord)
        url = getattr(emoji, "url", "") or ""
        return str(url)
    s = str(emoji)
    return s if len(s) <= 4 else ""


# Nen tang thuong ghi trong tieu de ([UNITY]/[IOS]/[Android]...). Gan nhan tuong ung.
_PLATFORMS = [("unity", "Unity"), ("ios", "iOS"), ("android", "Android"), ("web", "Web"), ("pc", "PC")]


def _platform_from_title(title: str) -> str | None:
    t = (title or "").lower()
    for key, name in _PLATFORMS:
        if re.search(rf"\b{key}\b", t):
            return name
    return None


async def _get_forum(client, forum_channel_id: int):
    ch = client.get_channel(forum_channel_id) or await client.fetch_channel(forum_channel_id)
    if not isinstance(ch, discord.ForumChannel):
        raise RuntimeError(f"channel {forum_channel_id} không phải Forum channel")
    return ch


async def _gather_threads(ch) -> list:
    """Moi thread cua forum (active + archived), dedupe theo id. ch.threads chi la
    CACHE (thuong rong luc moi khoi dong) -> lay active qua API cua guild moi du."""
    threads: dict[int, discord.Thread] = {}
    try:
        for t in await ch.guild.active_threads():
            if t.parent_id == ch.id:
                threads[t.id] = t
    except Exception as e:
        log.warning("Không lấy được active threads của guild: %s", e)
    for t in ch.threads:
        threads.setdefault(t.id, t)
    try:
        async for t in ch.archived_threads(limit=None):
            threads[t.id] = t
    except Exception as e:
        log.warning("Không đọc được archived threads của %s: %s", ch.id, e)
    return list(threads.values())


async def _sync_attachments(sb, thread_id: str, starter, prev_atts: list) -> list:
    """Anh/video/file cua bai post -> tai len Storage (URL Discord het han) va tra ve
    danh sach attachment. Da tung tai (theo sourceId) thi tai lai."""
    atts = list(getattr(starter, "attachments", None) or []) if starter else []
    if not atts:
        return prev_atts  # khong doc duoc / khong co -> giu nguyen cai cu
    prev_by_src = {a.get("sourceId"): a for a in prev_atts if a.get("sourceId")}
    out = []
    for att in atts:
        src = str(att.id)
        if src in prev_by_src:
            out.append(prev_by_src[src])
            continue
        kind = _att_kind(getattr(att, "content_type", None), att.filename)
        if kind == "video" and not MIRROR_VIDEOS:
            continue  # xem video qua nut "Mo Discord" (khong luu de do ton dung luong)
        entry = {"id": src, "sourceId": src, "kind": kind, "name": att.filename,
                 "provider": "discord", "url": att.url}
        if not att.size or att.size <= MAX_UPLOAD_BYTES:
            try:
                data = await att.read()
                path = f"bug-attachments/{thread_id}-{src}-{_safe_name(att.filename)}"
                ct = getattr(att, "content_type", None) or "application/octet-stream"
                await asyncio.to_thread(
                    lambda p=path, d=data, c=ct: sb.storage.from_(STORAGE_BUCKET).upload(
                        p, d, {"content-type": c, "upsert": "true"})
                )
                entry["url"] = sb.storage.from_(STORAGE_BUCKET).get_public_url(path)
                entry["storagePath"] = path
            except Exception as e:
                log.warning("Tải attachment '%s' lỗi (giữ link Discord): %s", att.filename, e)
        out.append(entry)
    return out


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
            # Mirror ten + icon giong het forum tag.
            if lab.get("name") != name or (lab.get("icon") or "") != (emoji or ""):
                sb.table(BUG_LABELS).update({"name": name, "icon": emoji or ""}).eq("id", lab["id"]).execute()
        elif _fold(name) in by_fold:
            lab = by_fold[_fold(name)]  # co nhan cung ten -> lien ket + dong bo icon Discord
            sb.table(BUG_LABELS).update({"discord_tag_id": tid, "icon": emoji or ""}).eq("id", lab["id"]).execute()
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


def _upsert_bugs(sb, project_id: str, items: list[dict], available: list, by_thread: dict) -> dict:
    tag_to_label = _sync_palette(sb, project_id, available)
    profiles = _profiles_by_discord(sb)
    # id -> ten nhan (gom ca nhan vua tao) de suy ra cot kanban tu tag.
    label_rows = sb.table(BUG_LABELS).select("id,name").eq("project_id", project_id).execute().data
    id_to_name = {r["id"]: r["name"] for r in label_rows}
    name_to_id = {r["name"].strip().lower(): r["id"] for r in label_rows}

    created = updated = 0
    for it in items:
        label_ids = []
        for tid in it["applied_tag_ids"]:
            lid = tag_to_label.get(tid)
            if lid and lid not in label_ids:
                label_ids.append(lid)
        # Nen tang tu tieu de -> gan nhan (neu nhan da ton tai trong palette).
        plat = _platform_from_title(it["title"])
        if plat:
            pl_id = name_to_id.get(plat.lower())
            if pl_id and pl_id not in label_ids:
                label_ids.append(pl_id)
        status = _status_from_label_names([id_to_name.get(lid, "") for lid in label_ids])
        rep = profiles.get(it["owner_id"])
        reporter_id = rep[0] if rep else None
        reporter_name = rep[1] if rep else it["author_name"]

        key = it["thread_id"]
        if key in by_thread:
            row = by_thread[key]
            patch = {"title": it["title"], "description": it["description"],
                     "reporter_id": reporter_id, "reporter_name": reporter_name,
                     "attachments": it["attachments"], "discord_guild_id": it["guild_id"]}
            # Ghi de created_at moi lan sync: Discord la nguon su that cho "bug bao luc nao",
            # va day cung la duong backfill cho bug da sync sai truoc do (ghi cung mot gia
            # tri moi lan nen lap lai vo hai).
            if it.get("created_at"):
                patch["created_at"] = it["created_at"]
            # App vua doi nhan (chua push) -> KHONG ghi de label/status; cho push xong da.
            if not row.get("pending_discord_push"):
                patch["label_ids"] = label_ids
                patch["status"] = status
            sb.table(BUGS).update(patch).eq("id", row["id"]).execute()
            updated += 1
        else:
            new_row = {
                "project_id": project_id, "title": it["title"], "description": it["description"],
                "status": status, "label_ids": label_ids,
                "reporter_id": reporter_id, "reporter_name": reporter_name,
                "discord_thread_id": key, "discord_guild_id": it["guild_id"],
                "attachments": it["attachments"],
            }
            # Thieu moc thi de Postgres dung `default now()` con hon ghi dai mot ngay sai.
            if it.get("created_at"):
                new_row["created_at"] = it["created_at"]
            sb.table(BUGS).insert(new_row).execute()
            created += 1
    return {"created": created, "updated": updated, "total": len(items)}


# --- Entry points -----------------------------------------------------------

async def sync_forum(client, sb, project_id: str, forum_channel_id: int) -> dict:
    """Discord -> app: doc forum (kem tai anh/video len Storage) roi upsert vao bugs."""
    ch = await _get_forum(client, forum_channel_id)
    available = [(str(t.id), t.name, _emoji_str(t.emoji)) for t in ch.available_tags]
    threads = await _gather_threads(ch)

    # Prefetch bug hien co (de dedupe attachment + biet co pending_discord_push).
    existing = await asyncio.to_thread(
        lambda: sb.table(BUGS).select("id,discord_thread_id,attachments,pending_discord_push")
        .eq("project_id", project_id).execute().data
    )
    by_thread = {r["discord_thread_id"]: r for r in existing if r.get("discord_thread_id")}

    items = []
    for t in threads:
        desc, author, starter = "", None, None
        try:
            starter = t.starter_message or await t.fetch_message(t.id)
            if starter:
                desc = starter.content or ""
                author = starter.author
        except Exception:
            pass
        owner_id = getattr(t, "owner_id", None) or (author.id if author else None)
        applied = [str(tag.id) for tag in (getattr(t, "applied_tags", None) or []) if getattr(tag, "id", None)]
        prev = by_thread.get(str(t.id)) or {}
        atts = await _sync_attachments(sb, str(t.id), starter, prev.get("attachments") or [])
        items.append({
            "thread_id": str(t.id),
            "title": (t.name or "(không tiêu đề)")[:200],
            "description": desc,
            "owner_id": str(owner_id) if owner_id else "",
            "author_name": (author.display_name if author else "") or "Discord",
            "applied_tag_ids": applied,
            "attachments": atts,
            "guild_id": str(t.guild.id) if t.guild else "",
            "created_at": _thread_created_at(t),
        })
    return await asyncio.to_thread(_upsert_bugs, sb, project_id, items, available, by_thread)


async def sync_all(client, sb) -> list[tuple[dict, dict]]:
    results = []
    for cfg in load_forum_configs():
        try:
            r = await sync_forum(client, sb, cfg["project_id"], cfg["forum_channel_id"])
        except Exception as e:
            log.exception("Sync forum %s thất bại", cfg["forum_channel_id"])
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
            log.warning("push: không lấy được forum %s: %s", cfg["forum_channel_id"], e)
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
                log.exception("push bug %s thất bại", b.get("id"))
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
                log.warning("Không tạo được forum tag '%s': %s", info.get("name"), e)
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
        print("LỖI: thiếu DISCORD_TOKEN trong .env", file=sys.stderr)
        return 1
    if not load_forum_configs():
        print("Chưa cấu hình 'bug_forums' trong settings.json.")
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
            print("LỖI sync:", e, file=sys.stderr)
            state["code"] = 1
        finally:
            await client.close()

    client.run(token)
    for cfg, r in state["results"]:
        if "error" in r:
            print(f"Forum {cfg['forum_channel_id']}: LỖI {r['error']}")
        else:
            print(f"Forum {cfg['forum_channel_id']}: tạo {r['created']}, cập nhật {r['updated']} (tổng {r['total']})")
    return state["code"]


async def _tally_forum(client, forum_channel_id: int) -> dict:
    """Chi DOC metadata (kich thuoc) attachment cua bai post - KHONG tai gi."""
    ch = await _get_forum(client, forum_channel_id)
    threads = await _gather_threads(ch)
    agg = {"threads": len(threads), "with_media": 0, "read_fail": 0,
           "img_n": 0, "img_b": 0, "vid_n": 0, "vid_b": 0, "file_n": 0, "file_b": 0}
    for t in threads:
        starter = t.starter_message
        if starter is None:
            try:
                starter = await t.fetch_message(t.id)
            except Exception:
                agg["read_fail"] += 1
        atts = list(getattr(starter, "attachments", None) or []) if starter else []
        if atts:
            agg["with_media"] += 1
        for att in atts:
            kind = _att_kind(getattr(att, "content_type", None), att.filename)
            sz = att.size or 0
            if kind == "image":
                agg["img_n"] += 1; agg["img_b"] += sz
            elif kind == "video":
                agg["vid_n"] += 1; agg["vid_b"] += sz
            else:
                agg["file_n"] += 1; agg["file_b"] += sz
    return agg


def run_estimate() -> int:
    """Uoc tinh dung luong media se luu, khong tai len."""
    token = os.getenv("DISCORD_TOKEN")
    if not token:
        print("LỖI: thiếu DISCORD_TOKEN", file=sys.stderr)
        return 1
    if not load_forum_configs():
        print("Chưa cấu hình 'bug_forums' trong settings.json.")
        return 0
    intents = discord.Intents.default()
    intents.message_content = True
    client = discord.Client(intents=intents)
    state = {"aggs": []}

    @client.event
    async def on_ready():
        try:
            for cfg in load_forum_configs():
                state["aggs"].append((cfg, await _tally_forum(client, cfg["forum_channel_id"])))
        except Exception as e:
            print("LỖI:", e, file=sys.stderr)
        finally:
            await client.close()

    client.run(token)
    mb = lambda b: b / 1024 / 1024  # noqa: E731
    total = 0
    for cfg, a in state["aggs"]:
        tb = a["img_b"] + a["vid_b"] + a["file_b"]
        total += tb
        print(f"\nForum {cfg['forum_channel_id']}: {a['threads']} bài post, {a['with_media']} bài có media"
              + (f"  [!] {a['read_fail']} bài KHÔNG đọc được nội dung (thiếu quyền Read Message History)" if a['read_fail'] else ""))
        print(f"  Ảnh   : {a['img_n']:>4} file  ~ {mb(a['img_b']):8.1f} MB")
        print(f"  Video : {a['vid_n']:>4} file  ~ {mb(a['vid_b']):8.1f} MB")
        print(f"  File  : {a['file_n']:>4} file  ~ {mb(a['file_b']):8.1f} MB")
        print(f"  TỔNG  : {mb(tb):.1f} MB")
    print(f"\n==> TỔNG media (bài gốc): {mb(total):.1f} MB. Free Supabase Storage = 1024 MB.")
    return 0


def run_perms() -> int:
    """In quyen HIEU LUC cua bot TREN kenh forum (tinh ca channel overwrite)."""
    token = os.getenv("DISCORD_TOKEN")
    if not token:
        print("LỖI: thiếu DISCORD_TOKEN", file=sys.stderr)
        return 1
    intents = discord.Intents.default()
    intents.message_content = True
    client = discord.Client(intents=intents)

    @client.event
    async def on_ready():
        try:
            for cfg in load_forum_configs():
                try:
                    ch = await _get_forum(client, cfg["forum_channel_id"])
                except Exception as e:
                    print(f"Không lấy được channel {cfg['forum_channel_id']}: {e}")
                    continue
                me = ch.guild.me
                p = ch.permissions_for(me)
                print(f"\nForum '{ch.name}' ({ch.id}) @ guild '{ch.guild.name}' (guild_id={ch.guild.id})")
                print(f"  Bot: {me}  |  roles: {[r.name for r in me.roles]}")
                for name in ("view_channel", "read_message_history", "manage_threads",
                             "manage_channels", "send_messages", "send_messages_in_threads"):
                    ok = getattr(p, name, None)
                    print(f"  {'OK ' if ok else 'NO '} {name}")
        finally:
            await client.close()

    client.run(token)
    return 0


if __name__ == "__main__":
    import argparse

    _p = argparse.ArgumentParser(description="Sync/uoc tinh bug tu forum Discord")
    _p.add_argument("--estimate", action="store_true", help="Chi uoc tinh dung luong media (khong tai len)")
    _p.add_argument("--perms", action="store_true", help="In quyen hieu luc cua bot tren kenh forum")
    _args = _p.parse_args()
    if _args.perms:
        sys.exit(run_perms())
    sys.exit(run_estimate() if _args.estimate else run_once())
