"""Discord bot quan ly sprint/task: tag bot -> goi Claude CLI -> Claude chay skill.

Kien truc lay tu bot com gia dinh: session-per-channel, _last_json, chunk,
khoa single-instance, mood tu settings.json, safe-vs-bypass permission.
Claude quyet dinh khi nao chay task_ops.py / sprint_report.py (skill bi gioi han
qua --allowedTools trong che do an toan).
"""

import asyncio
import datetime
import hashlib
import json
import logging
import os
import re
import socket
import sys
from pathlib import Path

import discord
from discord.ext import tasks
from dotenv import load_dotenv

load_dotenv()

TOKEN = os.environ["DISCORD_TOKEN"]
CLAUDE_CMD = os.getenv("CLAUDE_CMD", "claude")

# Cau hinh doc tu settings.json (doi model o day).
SETTINGS_FILE = Path(__file__).parent / "settings.json"
_settings = json.loads(SETTINGS_FILE.read_text(encoding="utf-8")) if SETTINGS_FILE.exists() else {}
CLAUDE_MODEL = _settings.get("model", "").strip()
CLAUDE_TIMEOUT = int(_settings.get("timeout_seconds", 300))
MAX_PARALLEL = int(_settings.get("max_parallel", 2))
SYSTEM_PROMPT = _settings.get("system_prompt") or (
    "You are a sprint/task tracker assistant on a Discord server for a dev team. "
    "Reply in the same language the user writes in (usually Vietnamese). "
    "Keep answers concise and Discord-friendly."
)

# Bo tam trang: moi ngay bot tu chon 1 tam trang (co dinh trong ngay, doi qua ngay).
MOODS = _settings.get("moods") or ["🙂 Hom nay toi binh thuong, than thien."]

_BOT_DIR = str(Path(__file__).parent)
_SKILLS_DIR = str(Path(__file__).parent / "skills")

# Skill dir tren sys.path de import truc tiep module sync bug (dung client dang chay).
if _SKILLS_DIR not in sys.path:
    sys.path.insert(0, _SKILLS_DIR)
import bug_sync  # noqa: E402  — doc forum Discord -> upsert bang `bugs`
from supabase_client import get_client  # noqa: E402

# Hint: chi Claude cach + khi nao chay tung skill, kem duong dan tuyet doi.
TASK_HINT = (
    " TASK SKILL: When the user wants to CREATE, UPDATE, ASSIGN or LIST tasks, run "
    f'`python "{_SKILLS_DIR}/task_ops.py" <subcommand> ...`. Subcommands:\n'
    "- create: --title (required) [--assignee <name|<@id>>] [--sprint <name|active|backlog>] "
    "[--priority <low|medium|high|urgent, accepts Vietnamese: gap/cao/thap...>] "
    "[--points N] [--due YYYY-MM-DD] [--desc ...]. Example 'tao task Fix login giao cho Nam, "
    "gap, sprint dang chay' -> create --title \"Fix login\" --assignee \"Nam\" --priority gap "
    "--sprint active.\n"
    "- update: --id <taskId> plus any of --status (todo|in_progress|review|done, accepts "
    "'dang lam'/'xong'/'review'/'can lam') --priority --title --assignee --points --due. "
    "Example 'task 3f9a1b2c xong roi' -> update --id 3f9a1b2c --status xong.\n"
    "- list: [--assignee <name|me>] [--sprint <name|active|backlog>] [--status <...>]. "
    "'me' maps to the sender. Example 'xem task cua toi' -> list --assignee me.\n"
    "Relay the script's printed output. The task id in [brackets] is a short id you can reuse."
)
SPRINT_HINT = (
    " SPRINT REPORT SKILL: When the user asks for a sprint report / progress "
    "('bao cao sprint', 'tien do sprint', 'sprint dang chay the nao'), run "
    f'`python "{_SKILLS_DIR}/sprint_report.py" [--sprint <name|active>]` (omit --sprint '
    "for the active sprint). Relay the printed report as-is."
)
FORMAT_HINT = (
    " FORMATTING RULES for Discord: NEVER use markdown tables (Discord does not render "
    "them). Use simple bullet lists. If script output contains Discord mention tokens "
    "like <@123456789>, copy them VERBATIM so Discord pings that person - do NOT convert "
    "them to plain names or change the digits. If a script prints a line starting with "
    "'LOI:', it failed - relay that error politely and do not retry blindly."
)
MOOD_HINT = ""  # co the mo rong sau (bot com co set_mood skill); giu de dong bo cau truc.

# Claude chay trong thu muc con 'workspace' (khong chua .env/key) cho an toan.
WORKSPACE = Path(__file__).parent / "workspace"
WORKSPACE.mkdir(exist_ok=True)


def today_mood() -> str:
    """Chon tam trang. Doc LIVE tu settings.json -> doi mood khong can restart.
    'mood_override' co gia tri -> ep theo do; khong thi random on dinh theo NGAY."""
    try:
        live = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    except Exception:
        live = _settings
    moods = live.get("moods") or MOODS
    override = str(live.get("mood_override") or "").strip()
    if override:
        if override.isdigit() and 1 <= int(override) <= len(moods):
            return moods[int(override) - 1]
        if not override.isdigit():
            return override
    day = datetime.date.today().isoformat()
    idx = int(hashlib.md5(day.encode()).hexdigest(), 16) % len(moods)
    return moods[idx]


# Khoa chong chay 2 instance: giu 1 port localhost lam lock.
_LOCK_PORT = 47612  # khac bot com (47611) de 2 bot chay song song duoc
_lock_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
    _lock_socket.bind(("127.0.0.1", _LOCK_PORT))
except OSError:
    print("Bot dang chay o cua so khac roi, khong mo them instance nua. Thoat.")
    sys.exit(2)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("bot")

intents = discord.Intents.default()
intents.message_content = True  # can Message Content Intent de doc noi dung tag
client = discord.Client(intents=intents)

# Giu ngu canh hoi thoai theo tung channel.
sessions: dict[int, str] = {}
claude_slots = asyncio.Semaphore(MAX_PARALLEL)

BYPASS_PERMISSIONS = bool(_settings.get("bypass_permissions", False))
# BOT_BYPASS (0/1) ghi de settings -> de run-bot-safe.bat tat bypass.
_env_bypass = os.getenv("BOT_BYPASS")
if _env_bypass is not None:
    BYPASS_PERMISSIONS = _env_bypass.strip() not in ("0", "", "false", "False")
ALLOWED_USER_IDS = {int(x) for x in _settings.get("allowed_user_ids", [])}
log.info("Bypass permissions: %s", BYPASS_PERMISSIONS)

# --- Dong bo bug tu forum Discord --------------------------------------------
BUG_FORUMS = _settings.get("bug_forums") or []
BUG_SYNC_HOUR = int(_settings.get("bug_sync_hour", 9))          # gio chay tu dong (mac dinh 9h)
BUG_SYNC_TZ = _settings.get("bug_sync_tz", "Asia/Ho_Chi_Minh")
BUG_SYNC_CHANNEL_ID = int(_settings.get("bug_sync_channel_id", 0) or 0)  # kenh bao ket qua (0 = tat)
BUG_SYNC_POLL_SECONDS = int(_settings.get("bug_sync_poll_seconds", 20))  # nhip quet yeu cau sync tu web

try:
    from zoneinfo import ZoneInfo
    _SYNC_TZINFO = ZoneInfo(BUG_SYNC_TZ)
    _SYNC_TIME = datetime.time(hour=BUG_SYNC_HOUR, minute=0, tzinfo=_SYNC_TZINFO)
except Exception:
    # Khong co tzdata -> quy doi tho ve UTC (VN = UTC+7). Cai 'tzdata' de chuan.
    log.warning("Khong load duoc timezone '%s' (thieu tzdata?), dung UTC xap xi.", BUG_SYNC_TZ)
    _SYNC_TIME = datetime.time(hour=(BUG_SYNC_HOUR - 7) % 24, minute=0)


def _last_json(text: str):
    """Doc dong JSON cuoi trong stdout cua claude (co the co dong phu truoc do)."""
    for line in reversed(text.splitlines()):
        line = line.strip()
        if line.startswith("{"):
            try:
                return json.loads(line)
            except Exception:
                continue
    try:
        return json.loads(text)
    except Exception:
        return None


def _build_args(prompt: str) -> list:
    """Dung danh sach tham so goi Claude CLI (tach ra cho de doc)."""
    args = [
        CLAUDE_CMD, "-p", prompt,
        "--output-format", "json",
        "--append-system-prompt",
        f"{SYSTEM_PROMPT}\n\nTAM TRANG HOM NAY (bat buoc nhap vai dung giong nay): "
        f"{today_mood()}\n{TASK_HINT}{SPRINT_HINT}{FORMAT_HINT}{MOOD_HINT}",
    ]
    if CLAUDE_MODEL:
        args += ["--model", CLAUDE_MODEL]
    if BYPASS_PERMISSIONS:
        args += ["--dangerously-skip-permissions"]
    else:
        # Che do an toan: chi doc file + chay dung 2 skill task, chan lenh khac.
        default_tools = [
            "Read", "Glob", "Grep",
            f'Bash(python "{_SKILLS_DIR}/task_ops.py":*)',
            f'Bash(python "{_SKILLS_DIR}/sprint_report.py":*)',
        ]
        tools = _settings.get("safe_allowed_tools") or default_tools
        args += ["--allowedTools", ",".join(tools)]
    return args


async def ask_claude(prompt: str, channel_id: int, sender_id: int = 0) -> str:
    args = _build_args(prompt)
    # Truyen ID nguoi gui that qua env -> skill dung de resolve 'me'/reporter,
    # KHONG lay tu prompt de tranh gia mao qua noi dung tin nhan.
    child_env = {**os.environ, "BOT_SENDER_ID": str(sender_id)}

    async def _attempt(resume_id):
        run_args = list(args)
        if resume_id:
            run_args += ["--resume", resume_id]
        async with claude_slots:
            proc = await asyncio.create_subprocess_exec(
                *run_args, cwd=WORKSPACE, env=child_env,
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                out_b, err_b = await asyncio.wait_for(
                    proc.communicate(), timeout=CLAUDE_TIMEOUT
                )
            except asyncio.TimeoutError:
                proc.kill()
                return "timeout", None, f"Claude khong tra loi sau {CLAUDE_TIMEOUT}s"
        out = out_b.decode("utf-8", errors="replace").strip()
        err = err_b.decode("utf-8", errors="replace").strip()
        return proc.returncode, _last_json(out), (err or out)

    last_err = "loi khong ro"
    for attempt in range(2):
        # Lan 1 co the resume; lan thu lai bo resume (session co the da hong).
        resume_id = sessions.get(channel_id) if attempt == 0 else None
        rc, data, raw = await _attempt(resume_id)

        if data is not None:
            if data.get("session_id"):
                sessions[channel_id] = data["session_id"]
            if data.get("is_error"):
                # Loi cap response (thuong overload). KHONG tu thu lai de tranh
                # chay lai tool (vd tao task) lan 2.
                sessions.pop(channel_id, None)
                raise RuntimeError(str(data.get("result") or data.get("subtype") or "loi")[:500])
            return data.get("result") or "(khong co noi dung tra ve)"

        # Khong doc duoc JSON -> that bai. Bo session, thu lai 1 lan (tru timeout).
        sessions.pop(channel_id, None)
        last_err = raw or f"claude exited with code {rc}"
        if rc == "timeout":
            break

    raise RuntimeError(last_err[:500])


def strip_mentions(content: str) -> str:
    return re.sub(r"<@!?\d+>", "", content).strip()


def chunk(text: str, size: int = 1990) -> list:
    parts = []
    while text:
        if len(text) <= size:
            parts.append(text)
            break
        cut = text.rfind("\n", 0, size)
        if cut < size // 2:
            cut = size
        parts.append(text[:cut])
        text = text[cut:].lstrip("\n")
    return parts


# --- Bug sync: chay bang client dang song (doc forum + ghi Supabase) ----------

SYNC_BUG_RE = re.compile(r"sync\s*bug|(dong|đồng)\s*bo|bộ\s*bug", re.IGNORECASE)


def _summarize(results) -> str:
    parts = []
    for cfg, r in results:
        if "error" in r:
            parts.append(f"forum {cfg['forum_channel_id']}: lỗi {str(r['error'])[:80]}")
        else:
            parts.append(f"tạo {r['created']}, cập nhật {r['updated']} (tổng {r['total']})")
    return "; ".join(parts) or "chưa cấu hình forum nào"


async def _do_sync_all() -> str:
    """Sync moi forum cau hinh; tra ve chuoi tom tat."""
    results = await bug_sync.sync_all(client, get_client())
    return _summarize(results)


@tasks.loop(time=_SYNC_TIME)
async def daily_bug_sync():
    if not BUG_FORUMS:
        return
    try:
        summary = await _do_sync_all()
    except Exception:
        log.exception("Dong bo bug tu dong that bai")
        return
    log.info("Dong bo bug tu dong: %s", summary)
    if BUG_SYNC_CHANNEL_ID:
        try:
            ch = client.get_channel(BUG_SYNC_CHANNEL_ID) or await client.fetch_channel(BUG_SYNC_CHANNEL_ID)
            await ch.send(f"🐞 Đồng bộ bug tự động ({BUG_SYNC_HOUR}h): {summary}")
        except Exception:
            log.warning("Khong gui duoc tom tat sync bug")


@tasks.loop(seconds=BUG_SYNC_POLL_SECONDS)
async def poll_bug_sync_requests():
    """Moi nhip: (1) day thay doi nhan tu app -> Discord, (2) xu ly yeu cau 'Sync' tu web."""
    if not BUG_FORUMS:
        return
    try:
        sb = get_client()
    except Exception as e:
        log.warning("Chua cau hinh Supabase (dat SUPABASE_SERVICE_ROLE_KEY trong .env): %s", e)
        return
    # (1) app -> Discord: bug co pending_discord_push (nguoi dung doi nhan tren app).
    try:
        n = await bug_sync.push_pending(client, sb)
        if n:
            log.info("Da day %d bug (nhan) len Discord", n)
    except Exception:
        log.exception("Day nhan len Discord loi")
    # (2) web -> yeu cau sync (nut 'Sync Discord').
    try:
        pending = await asyncio.to_thread(
            lambda: sb.table("bug_sync_requests").select("*").eq("status", "pending").order("created_at").execute().data
        )
    except Exception as e:
        log.warning("Doc bug_sync_requests loi: %s", e)
        return
    for req in pending or []:
        await _process_sync_request(sb, req)


async def _process_sync_request(sb, req):
    pid = req.get("project_id")
    cfg = bug_sync.forum_for_project(pid) if pid else (BUG_FORUMS[0] if len(BUG_FORUMS) == 1 else None)
    status, result = "done", ""
    try:
        if not cfg:
            raise RuntimeError("chua cau hinh forum cho project nay")
        r = await bug_sync.sync_forum(client, sb, cfg["project_id"], int(cfg["forum_channel_id"]))
        result = f"tao {r['created']}, cap nhat {r['updated']} (tong {r['total']})"
    except Exception as e:
        status, result = "error", str(e)[:300]
        log.exception("Xu ly yeu cau sync bug loi")
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        await asyncio.to_thread(
            lambda: sb.table("bug_sync_requests").update(
                {"status": status, "result": result, "processed_at": now_iso}
            ).eq("id", req["id"]).execute()
        )
    except Exception as e:
        log.warning("Cap nhat trang thai sync request loi: %s", e)


@client.event
async def on_ready():
    log.info("Bot online: %s (id=%s)", client.user, client.user.id)
    if BUG_FORUMS:
        if not daily_bug_sync.is_running():
            daily_bug_sync.start()
        if not poll_bug_sync_requests.is_running():
            poll_bug_sync_requests.start()
        log.info("Bug sync bat: %d forum, chay luc %sh (%s)", len(BUG_FORUMS), BUG_SYNC_HOUR, BUG_SYNC_TZ)


@client.event
async def on_message(message: discord.Message):
    if message.author.bot:
        return
    if client.user not in message.mentions or message.mention_everyone:
        return
    # Chi gioi han allowed_user_ids KHI bypass (che do nguy hiem). Safe -> ai cung hoi duoc.
    if BYPASS_PERMISSIONS and ALLOWED_USER_IDS and message.author.id not in ALLOWED_USER_IDS:
        return

    question = strip_mentions(message.content)
    if not question:
        await message.reply(
            "Tag toi kem yeu cau nhe, vi du: `@bot tao task Fix login giao cho Nam, gap`"
        )
        return

    # Lenh nhanh: "@bot sync bug" -> dong bo bug tu forum ngay (khong qua Claude).
    if BUG_FORUMS and SYNC_BUG_RE.search(question) and "bug" in question.lower():
        log.info("[#%s] %s yeu cau sync bug", message.channel, message.author)
        try:
            async with message.channel.typing():
                summary = await _do_sync_all()
            await message.reply(f"🐞 Đã đồng bộ bug từ forum Discord: {summary}")
        except Exception as e:
            log.exception("Sync bug qua lenh that bai")
            await message.reply(f"⚠️ Sync bug lỗi: `{str(e)[:250]}`")
        return

    log.info("[#%s] %s hoi: %s", message.channel, message.author, question[:120])
    try:
        async with message.channel.typing():
            answer = await ask_claude(
                f"Nguoi gui: {message.author.display_name} (Discord id {message.author.id}). "
                f"Yeu cau: {question}",
                message.channel.id,
                sender_id=message.author.id,
            )
        for i, part in enumerate(chunk(answer)):
            if i == 0:
                await message.reply(part)
            else:
                await message.channel.send(part)
    except Exception as e:
        log.exception("Loi khi tra loi")
        await message.reply(f"⚠️ Co loi xay ra: `{str(e)[:300]}`")


if __name__ == "__main__":
    client.run(TOKEN)
