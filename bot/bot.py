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
DOC_HINT = (
    " DOC SEARCH SKILL (RAG): When the user asks about the CONTENT of documents "
    "(spec, tai lieu, huong dan, quy trinh, chinh sach, meeting notes) rather than "
    "tasks/sprints, run "
    f'`python "{_SKILLS_DIR}/doc_search.py" "<cau hoi>" [--project <id>] [--top-k N]`. '
    "It returns the most relevant chunks with their source. Answer ONLY from those "
    "chunks and cite the source [1],[2]...; if nothing relevant is returned, say the "
    "document store has no matching info (do NOT invent an answer)."
)
SHEET_HINT = (
    " GOOGLE SHEETS SKILL (live, CHI DOC): When the user asks about data inside a "
    "Google Sheet in the shared Drive folder ('sheet', 'bang tinh', 'file tren drive', "
    "'so lieu trong file ...'), use the google-sheets MCP tools: "
    "mcp__google-sheets__list_spreadsheets de tim file, "
    "mcp__google-sheets__list_sheets de xem cac tab, roi "
    "mcp__google-sheets__get_sheet_data / search_spreadsheets / find_in_spreadsheet de doc. "
    "READ ONLY - TUYET DOI khong tao/sua/xoa sheet. Tom tat gon cho Discord (khong dung bang markdown)."
)
FORMAT_HINT = (
    " FORMATTING RULES for Discord: NEVER use markdown tables (Discord does not render "
    "them). Use simple bullet lists. If script output contains Discord mention tokens "
    "like <@123456789>, copy them VERBATIM so Discord pings that person - do NOT convert "
    "them to plain names or change the digits. If a script prints a line starting with "
    "'LOI:', it failed - relay that error politely and do not retry blindly."
)
MOOD_HINT = ""  # co the mo rong sau (bot com co set_mood skill); giu de dong bo cau truc.

# --- Google Sheets MCP (tuy chon, mac dinh TAT) ------------------------------
# Bat bang "sheets_mcp_enabled": true trong settings.json SAU khi da tao service
# account + dien bot/mcp-bot.json. Tat -> bot chay y het nhu truoc (khong dung MCP).
SHEETS_MCP_ENABLED = bool(_settings.get("sheets_mcp_enabled", False))
_MCP_BOT_CONFIG = str(Path(__file__).parent / "mcp-bot.json")
# Chi mo cac tool DOC (khong cho ghi/sua sheet) o che do an toan.
SHEET_READ_TOOLS = [
    "mcp__google-sheets__list_spreadsheets",
    "mcp__google-sheets__list_sheets",
    "mcp__google-sheets__list_folders",
    "mcp__google-sheets__get_sheet_data",
    "mcp__google-sheets__get_sheet_formulas",
    "mcp__google-sheets__get_multiple_sheet_data",
    "mcp__google-sheets__get_multiple_spreadsheet_summary",
    "mcp__google-sheets__search_spreadsheets",
    "mcp__google-sheets__find_in_spreadsheet",
]

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
    print("Bot đang chạy ở cửa sổ khác rồi, không mở thêm instance nữa. Thoát.")
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

# --- Dong bo RAG (tai lieu) tu dong: chay CUNG gio voi bug sync (mac dinh 9h) -----
RAG_SYNC_ENABLED = bool(_settings.get("rag_sync_enabled", False))
RAG_SYNC_TIMEOUT = int(_settings.get("rag_sync_timeout_seconds", 900))  # gioi han moi skill (giay)
_GDRIVE_KEY_DEFAULT = Path(__file__).parent.parent / "keys" / "service-account-gsheets.json"

try:
    from zoneinfo import ZoneInfo
    _SYNC_TZINFO = ZoneInfo(BUG_SYNC_TZ)
    _SYNC_TIME = datetime.time(hour=BUG_SYNC_HOUR, minute=0, tzinfo=_SYNC_TZINFO)
except Exception:
    # Khong co tzdata -> quy doi tho ve UTC (VN = UTC+7). Cai 'tzdata' de chuan.
    log.warning("Không load được timezone '%s' (thiếu tzdata?), dùng UTC xấp xỉ.", BUG_SYNC_TZ)
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
    hints = f"{TASK_HINT}{SPRINT_HINT}{DOC_HINT}"
    if SHEETS_MCP_ENABLED:
        hints += SHEET_HINT
    hints += f"{FORMAT_HINT}{MOOD_HINT}"
    args = [
        CLAUDE_CMD, "-p", prompt,
        "--output-format", "json",
        "--append-system-prompt",
        f"{SYSTEM_PROMPT}\n\nTAM TRANG HOM NAY (bat buoc nhap vai dung giong nay): "
        f"{today_mood()}\n{hints}",
    ]
    if CLAUDE_MODEL:
        args += ["--model", CLAUDE_MODEL]
    # Nap RIENG config MCP google-sheets cho bot (--strict-mcp-config -> bo qua .mcp.json,
    # tranh keo theo Supabase HTTP MCP lam treo phien khong tuong tac).
    if SHEETS_MCP_ENABLED:
        args += ["--mcp-config", _MCP_BOT_CONFIG, "--strict-mcp-config"]
    if BYPASS_PERMISSIONS:
        args += ["--dangerously-skip-permissions"]
    else:
        # Che do an toan: chi doc file + chay dung cac skill, chan lenh khac.
        default_tools = [
            "Read", "Glob", "Grep",
            f'Bash(python "{_SKILLS_DIR}/task_ops.py":*)',
            f'Bash(python "{_SKILLS_DIR}/sprint_report.py":*)',
            f'Bash(python "{_SKILLS_DIR}/doc_search.py":*)',
        ]
        if SHEETS_MCP_ENABLED:
            default_tools += SHEET_READ_TOOLS  # chi cac tool DOC sheet
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
        log.exception("Đồng bộ bug tự động thất bại")
        return
    log.info("Đồng bộ bug tự động: %s", summary)
    if BUG_SYNC_CHANNEL_ID:
        try:
            ch = client.get_channel(BUG_SYNC_CHANNEL_ID) or await client.fetch_channel(BUG_SYNC_CHANNEL_ID)
            await ch.send(f"🐞 Đồng bộ bug tự động ({BUG_SYNC_HOUR}h): {summary}")
        except Exception:
            log.warning("Không gửi được tóm tắt sync bug")


def _gdrive_key_ready() -> bool:
    """Co service account key cho drive_catalog khong (env GDRIVE_SERVICE_ACCOUNT > mac dinh)."""
    raw = os.getenv("GDRIVE_SERVICE_ACCOUNT")
    if not raw:
        return _GDRIVE_KEY_DEFAULT.exists()
    p = Path(raw)
    return (p if p.is_absolute() else (Path(__file__).parent.parent / p)).exists()


async def _run_rag_skill(script: str) -> str:
    """Chay 1 skill RAG (python skills/<script>) bang subprocess. Tra ve dong ket qua cuoi."""
    proc = await asyncio.create_subprocess_exec(
        sys.executable, os.path.join(_SKILLS_DIR, script),
        cwd=str(Path(__file__).parent),
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    try:
        out_b, _ = await asyncio.wait_for(proc.communicate(), timeout=RAG_SYNC_TIMEOUT)
    except asyncio.TimeoutError:
        proc.kill()
        return f"timeout > {RAG_SYNC_TIMEOUT}s"
    out = out_b.decode("utf-8", errors="replace").strip()
    return out.splitlines()[-1] if out else f"rc={proc.returncode}"


@tasks.loop(time=_SYNC_TIME)
async def daily_rag_sync():
    """9h moi ngay: nap lai tai lieu docs/ + danh muc Google Drive vao kho RAG."""
    if not RAG_SYNC_ENABLED:
        return
    parts = []
    try:
        parts.append("docs: " + await _run_rag_skill("sync_docs.py"))
    except Exception:
        log.exception("Đồng bộ RAG (docs) thất bại")
        parts.append("docs: lỗi")
    if _gdrive_key_ready():  # chi nap Drive khi da co service account key
        try:
            parts.append("drive: " + await _run_rag_skill("drive_catalog.py"))
        except Exception:
            log.exception("Đồng bộ RAG (drive) thất bại")
            parts.append("drive: lỗi")
    summary = " | ".join(parts)
    log.info("Đồng bộ RAG tự động: %s", summary)
    if BUG_SYNC_CHANNEL_ID:
        try:
            ch = client.get_channel(BUG_SYNC_CHANNEL_ID) or await client.fetch_channel(BUG_SYNC_CHANNEL_ID)
            await ch.send(f"📚 Đồng bộ RAG tự động ({BUG_SYNC_HOUR}h): {summary}")
        except Exception:
            log.warning("Không gửi được tóm tắt sync RAG")


@tasks.loop(seconds=BUG_SYNC_POLL_SECONDS)
async def poll_bug_sync_requests():
    """Moi nhip: (1) day thay doi nhan tu app -> Discord, (2) xu ly yeu cau 'Sync' tu web."""
    if not BUG_FORUMS:
        return
    try:
        sb = get_client()
    except Exception as e:
        log.warning("Chưa cấu hình Supabase (đặt SUPABASE_SERVICE_ROLE_KEY trong .env): %s", e)
        return
    # (1) app -> Discord: bug co pending_discord_push (nguoi dung doi nhan tren app).
    try:
        n = await bug_sync.push_pending(client, sb)
        if n:
            log.info("Đã đẩy %d bug (nhãn) lên Discord", n)
    except Exception:
        log.exception("Đẩy nhãn lên Discord lỗi")
    # (2) web -> yeu cau sync (nut 'Sync Discord').
    try:
        pending = await asyncio.to_thread(
            lambda: sb.table("bug_sync_requests").select("*").eq("status", "pending").order("created_at").execute().data
        )
    except Exception as e:
        log.warning("Đọc bug_sync_requests lỗi: %s", e)
        return
    for req in pending or []:
        await _process_sync_request(sb, req)


async def _process_sync_request(sb, req):
    pid = req.get("project_id")
    cfg = bug_sync.forum_for_project(pid) if pid else (BUG_FORUMS[0] if len(BUG_FORUMS) == 1 else None)
    status, result = "done", ""
    try:
        if not cfg:
            raise RuntimeError("chưa cấu hình forum cho project này")
        r = await bug_sync.sync_forum(client, sb, cfg["project_id"], int(cfg["forum_channel_id"]))
        result = f"tạo {r['created']}, cập nhật {r['updated']} (tổng {r['total']})"
    except Exception as e:
        status, result = "error", str(e)[:300]
        log.exception("Xử lý yêu cầu sync bug lỗi")
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        await asyncio.to_thread(
            lambda: sb.table("bug_sync_requests").update(
                {"status": status, "result": result, "processed_at": now_iso}
            ).eq("id", req["id"]).execute()
        )
    except Exception as e:
        log.warning("Cập nhật trạng thái sync request lỗi: %s", e)


@client.event
async def on_ready():
    log.info("Bot online: %s (id=%s)", client.user, client.user.id)
    if BUG_FORUMS:
        if not daily_bug_sync.is_running():
            daily_bug_sync.start()
        if not poll_bug_sync_requests.is_running():
            poll_bug_sync_requests.start()
        log.info("Bug sync bật: %d forum, chạy lúc %sh (%s)", len(BUG_FORUMS), BUG_SYNC_HOUR, BUG_SYNC_TZ)
    if RAG_SYNC_ENABLED and not daily_rag_sync.is_running():
        daily_rag_sync.start()
        log.info("RAG sync bật: chạy lúc %sh (%s)", BUG_SYNC_HOUR, BUG_SYNC_TZ)


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
            "Tag tôi kèm yêu cầu nhé, ví dụ: `@bot tạo task Fix login giao cho Nam, gấp`"
        )
        return

    # Lenh nhanh: "@bot sync bug" -> dong bo bug tu forum ngay (khong qua Claude).
    if BUG_FORUMS and SYNC_BUG_RE.search(question) and "bug" in question.lower():
        log.info("[#%s] %s yêu cầu sync bug", message.channel, message.author)
        try:
            async with message.channel.typing():
                summary = await _do_sync_all()
            await message.reply(f"🐞 Đã đồng bộ bug từ forum Discord: {summary}")
        except Exception as e:
            log.exception("Sync bug qua lệnh thất bại")
            await message.reply(f"⚠️ Sync bug lỗi: `{str(e)[:250]}`")
        return

    log.info("[#%s] %s hỏi: %s", message.channel, message.author, question[:120])
    try:
        async with message.channel.typing():
            answer = await ask_claude(
                f"Người gửi: {message.author.display_name} (Discord id {message.author.id}). "
                f"Yêu cầu: {question}",
                message.channel.id,
                sender_id=message.author.id,
            )
        for i, part in enumerate(chunk(answer)):
            if i == 0:
                await message.reply(part)
            else:
                await message.channel.send(part)
    except Exception as e:
        log.exception("Lỗi khi trả lời")
        await message.reply(f"⚠️ Có lỗi xảy ra: `{str(e)[:300]}`")


if __name__ == "__main__":
    client.run(TOKEN)
