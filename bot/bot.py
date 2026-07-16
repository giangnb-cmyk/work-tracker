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
import weekly_report  # noqa: E402  — task Supabase -> Google Sheet cua tung project
import weekly_mail  # noqa: E402  — soan + gui mail weekly report tu template Gmail
import member_dm  # noqa: E402  — DM diem tuan (task xong/ton dong) cho tung member
from supabase_client import get_client  # noqa: E402

# Hint chi Claude cach + khi nao chay tung skill: xem hints.py.
from hints import SKILL_TOOL_PATTERNS, build_hints  # noqa: E402

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

# --- Weekly report tu dong: SANG THU 2, cung gio voi bug sync (mac dinh 9h) -------
WEEKLY_REPORT_ENABLED = bool(_settings.get("weekly_report_enabled", False))

# --- Weekly MAIL tu dong: gio/thu rieng, cau hinh trong settings.json > weekly_mail ---
WEEKLY_MAIL_CFG = _settings.get("weekly_mail", {}) or {}
WEEKLY_MAIL_ENABLED = bool(WEEKLY_MAIL_CFG.get("enabled", False))
_MAIL_HOUR = int(WEEKLY_MAIL_CFG.get("hour", BUG_SYNC_HOUR))
_MAIL_WEEKDAY = int(WEEKLY_MAIL_CFG.get("weekday", 0))  # 0 = thu 2

# --- DM diem tuan cho member: mac dinh THU 5, cau hinh settings.json > member_dm ------
MEMBER_DM_CFG = _settings.get("member_dm", {}) or {}
MEMBER_DM_ENABLED = bool(MEMBER_DM_CFG.get("enabled", False))
_DM_HOUR = int(MEMBER_DM_CFG.get("hour", BUG_SYNC_HOUR))
_DM_WEEKDAY = int(MEMBER_DM_CFG.get("weekday", 3))  # 3 = thu 5

try:
    from zoneinfo import ZoneInfo
    _SYNC_TZINFO = ZoneInfo(BUG_SYNC_TZ)
    _SYNC_TIME = datetime.time(hour=BUG_SYNC_HOUR, minute=0, tzinfo=_SYNC_TZINFO)
    _MAIL_TIME = datetime.time(hour=_MAIL_HOUR, minute=0, tzinfo=_SYNC_TZINFO)
    _DM_TIME = datetime.time(hour=_DM_HOUR, minute=0, tzinfo=_SYNC_TZINFO)
except Exception:
    # Khong co tzdata -> quy doi tho ve UTC (VN = UTC+7). Cai 'tzdata' de chuan.
    log.warning("Không load được timezone '%s' (thiếu tzdata?), dùng UTC xấp xỉ.", BUG_SYNC_TZ)
    _SYNC_TIME = datetime.time(hour=(BUG_SYNC_HOUR - 7) % 24, minute=0)
    _MAIL_TIME = datetime.time(hour=(_MAIL_HOUR - 7) % 24, minute=0)
    _DM_TIME = datetime.time(hour=(_DM_HOUR - 7) % 24, minute=0)
    # Phai gan: weekly_report_sync doc bien nay de biet hom nay co phai thu 2 khong.
    # None -> datetime.now(None) tra gio may, dung xap xi cung tinh than nhanh o tren.
    _SYNC_TZINFO = None


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
    hints = build_hints(SHEETS_MCP_ENABLED)
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
        # Quyen GHI khong nam o day — skill tu check admin (skills/permissions.py).
        default_tools = ["Read", "Glob", "Grep"] + SKILL_TOOL_PATTERNS
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


@tasks.loop(time=_SYNC_TIME)
async def weekly_report_sync():
    """Sáng thứ 2: điền weekly report vào Google Sheet của từng project."""
    if not WEEKLY_REPORT_ENABLED:
        return
    # tasks.loop(time=...) chạy MỖI NGÀY — discord.py không có tham số 'weekday', nên tự lọc.
    if datetime.datetime.now(_SYNC_TZINFO).weekday() != 0:  # 0 = thứ 2
        return
    try:
        # run_all chặn (gọi Sheets + Supabase đồng bộ) -> đẩy sang thread, đừng treo event loop.
        # force=False: KHÔNG bao giờ tự ghi đè ô người viết tay trong lần chạy tự động.
        lines = await asyncio.to_thread(weekly_report.run_all)
    except Exception:
        log.exception("Weekly report tự động thất bại")
        return
    summary = "\n".join(lines).strip()
    log.info("Weekly report tự động:\n%s", summary)
    if BUG_SYNC_CHANNEL_ID:
        try:
            ch = client.get_channel(BUG_SYNC_CHANNEL_ID) or await client.fetch_channel(BUG_SYNC_CHANNEL_ID)
            await ch.send(f"📊 Weekly report tự động (thứ 2, {BUG_SYNC_HOUR}h):\n```\n{summary[:1800]}\n```")
        except Exception:
            log.warning("Không gửi được tóm tắt weekly report")


async def _mail_channel_note(text: str):
    """Bao ket qua weekly mail vao kenh sync (neu co cau hinh)."""
    if not BUG_SYNC_CHANNEL_ID:
        return
    try:
        ch = client.get_channel(BUG_SYNC_CHANNEL_ID) or await client.fetch_channel(BUG_SYNC_CHANNEL_ID)
        await ch.send(text[:1900])
    except Exception:
        log.warning("Không gửi được thông báo weekly mail vào kênh")


async def _weekly_mail_approvers() -> list[int]:
    """Discord id cua nguoi duyet mail: settings.weekly_mail.approver_ids, khong co thi
    lay MOI admin da link Discord (profiles.role=admin, discord_id khac rong)."""
    ids = [int(x) for x in WEEKLY_MAIL_CFG.get("approver_ids", []) if str(x).strip()]
    if ids:
        return ids

    def _fetch():
        rows = (get_client().table("profiles").select("discord_id")
                .eq("role", "admin").execute().data or [])
        return [int(r["discord_id"]) for r in rows if r.get("discord_id")]

    try:
        return await asyncio.to_thread(_fetch)
    except Exception:
        log.exception("Không lấy được danh sách admin để duyệt weekly mail")
        return []


class WeeklyMailApproveView(discord.ui.View):
    """Nut ✅ Gửi / ✕ Huỷ duoi ban xem truoc DM cho admin. FAIL-CLOSED: khong bam gi
    (het han) hoac bam Huy -> KHONG gui. Nhieu admin cung nhan DM thi ai bam truoc
    thang — co `_done` tren dict mail dung chung de khong gui trung."""

    def __init__(self, mail: dict):
        timeout_h = float(WEEKLY_MAIL_CFG.get("approve_timeout_hours", 24))
        super().__init__(timeout=timeout_h * 3600)
        self.mail = mail
        self.message: discord.Message | None = None

    async def _finish(self, interaction: discord.Interaction, text: str):
        for child in self.children:
            child.disabled = True
        await interaction.response.edit_message(view=self)
        await interaction.followup.send(text)
        self.stop()

    @discord.ui.button(label="✅ Gửi mail", style=discord.ButtonStyle.success)
    async def approve(self, interaction: discord.Interaction, _button: discord.ui.Button):
        if self.mail.get("_done"):
            await self._finish(interaction, "Mail này đã được người khác xử lý rồi.")
            return
        self.mail["_done"] = True  # set TRUOC await de nguoi thu 2 khong gui trung
        try:
            msg_id = await asyncio.to_thread(weekly_mail.send_built, self.mail)
        except Exception:
            self.mail["_done"] = False
            log.exception("Gửi weekly mail thất bại sau khi duyệt")
            await self._finish(interaction, "⚠ Gửi THẤT BẠI — xem log trên máy chạy bot rồi thử lại bằng `@bot gửi mail weekly report`.")
            return
        await self._finish(interaction, f"📧 ĐÃ GỬI tới {', '.join(self.mail['to'])} (id {msg_id})")
        await _mail_channel_note(f"📧 Weekly mail đã được duyệt và gửi: {self.mail['subject']}")

    @discord.ui.button(label="✕ Huỷ", style=discord.ButtonStyle.danger)
    async def reject(self, interaction: discord.Interaction, _button: discord.ui.Button):
        self.mail["_done"] = True
        await self._finish(interaction, "Đã huỷ — tuần này không gửi mail tự động.")

    async def on_timeout(self):
        if self.message and not self.mail.get("_done"):
            try:
                await self.message.reply("⌛ Hết hạn duyệt — mail tuần này KHÔNG được gửi.")
            except Exception:
                pass


@tasks.loop(time=_MAIL_TIME)
async def weekly_mail_send():
    """Sáng thứ 2 (mặc định): soạn mail weekly report rồi DM cho admin DUYỆT —
    chỉ gửi khi admin bấm ✅. Nội dung cùng nguồn dữ liệu với sheet."""
    if not WEEKLY_MAIL_ENABLED:
        return
    # tasks.loop(time=...) chạy MỖI NGÀY — tự lọc thứ, giống weekly_report_sync.
    if datetime.datetime.now(_SYNC_TZINFO).weekday() != _MAIL_WEEKDAY:
        return
    try:
        # Chặn (gọi Gmail + Supabase đồng bộ) -> đẩy sang thread, đừng treo event loop.
        mail = await asyncio.to_thread(weekly_mail.build_mail)
    except Exception as e:
        log.exception("Soạn weekly mail thất bại")
        await _mail_channel_note(f"⚠ Soạn weekly mail thất bại: {e}")
        return

    approvers = await _weekly_mail_approvers()
    if not approvers:
        log.error("Weekly mail: không có ai để duyệt (admin chưa link discord_id?) — KHÔNG gửi.")
        await _mail_channel_note("⚠ Weekly mail: không tìm được admin để DM duyệt — KHÔNG gửi.")
        return

    preview = weekly_mail.preview_text(mail)
    reached = 0
    for uid in approvers:
        try:
            user = client.get_user(uid) or await client.fetch_user(uid)
            view = WeeklyMailApproveView(mail)
            view.message = await user.send(preview, view=view)
            reached += 1
        except Exception:
            log.warning("Không DM được người duyệt %s", uid)
    if reached == 0:
        await _mail_channel_note("⚠ Weekly mail: DM duyệt không tới được ai (chặn DM?) — KHÔNG gửi.")
    else:
        log.info("Weekly mail: đã DM bản xem trước cho %d người duyệt", reached)


@tasks.loop(time=_DM_TIME)
async def member_dm_weekly():
    """Thứ 5 (mặc định): DM riêng từng member số task xong/tồn đọng + câu động viên."""
    if not MEMBER_DM_ENABLED:
        return
    # tasks.loop(time=...) chạy MỖI NGÀY — tự lọc thứ, giống weekly_report_sync.
    if datetime.datetime.now(_SYNC_TZINFO).weekday() != _DM_WEEKDAY:
        return
    try:
        # build_summaries chặn (query Supabase đồng bộ) -> đẩy sang thread;
        # send_dms thì cần event loop của client đang sống nên await trực tiếp.
        summaries = await asyncio.to_thread(member_dm.build_summaries, get_client())
        lines = await member_dm.send_dms(client, summaries)
    except Exception:
        log.exception("DM điểm tuần tự động thất bại")
        return
    summary = "\n".join(lines).strip()
    log.info("DM điểm tuần tự động:\n%s", summary)
    if BUG_SYNC_CHANNEL_ID:
        try:
            ch = client.get_channel(BUG_SYNC_CHANNEL_ID) or await client.fetch_channel(BUG_SYNC_CHANNEL_ID)
            await ch.send(
                f"💌 DM điểm tuần tự động (thứ {_DM_WEEKDAY + 2}, {_DM_HOUR}h):\n```\n{summary[:1800]}\n```"
            )
        except Exception:
            log.warning("Không gửi được tóm tắt DM điểm tuần")


@tasks.loop(seconds=BUG_SYNC_POLL_SECONDS)
async def poll_member_dm_requests():
    """Quét yêu cầu 'Gửi test' từ web (bảng member_dm_requests, nút ở tab Cấu hình)."""
    if not MEMBER_DM_ENABLED:
        return
    try:
        sb = get_client()
        pending = await asyncio.to_thread(
            lambda: sb.table("member_dm_requests").select("*").eq("status", "pending").order("created_at").execute().data
        )
    except Exception as e:
        log.warning("Đọc member_dm_requests lỗi (chưa áp migration 0025?): %s", e)
        return
    for req in pending or []:
        await _process_dm_request(sb, req)


async def _process_dm_request(sb, req):
    status, result = "done", ""
    try:
        # test=True: tin nhắn mở đầu bằng dòng '🧪 test' để member không tưởng lịch thật.
        summary = await asyncio.to_thread(member_dm.summary_for, sb, req["target_user_id"], test=True)
        line = (await member_dm.send_dms(client, [summary]))[0]
        result = line.lstrip("- ").strip()[:300]
        if "đã gửi DM" not in line:
            status = "error"
    except Exception as e:
        status, result = "error", str(e)[:300]
        log.exception("Xử lý yêu cầu DM test lỗi")
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        await asyncio.to_thread(
            lambda: sb.table("member_dm_requests").update(
                {"status": status, "result": result, "processed_at": now_iso}
            ).eq("id", req["id"]).execute()
        )
    except Exception as e:
        log.warning("Cập nhật trạng thái DM test lỗi: %s", e)


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
    if WEEKLY_REPORT_ENABLED and not weekly_report_sync.is_running():
        weekly_report_sync.start()
        log.info("Weekly report bật: thứ 2 lúc %sh (%s)", BUG_SYNC_HOUR, BUG_SYNC_TZ)
    if WEEKLY_MAIL_ENABLED and not weekly_mail_send.is_running():
        weekly_mail_send.start()
        log.info("Weekly mail bật: thứ %d lúc %sh (%s)", _MAIL_WEEKDAY + 2, _MAIL_HOUR, BUG_SYNC_TZ)
    if MEMBER_DM_ENABLED:
        if not member_dm_weekly.is_running():
            member_dm_weekly.start()
        if not poll_member_dm_requests.is_running():
            poll_member_dm_requests.start()
        log.info(
            "Member DM bật: thứ %d lúc %sh (%s) + quét yêu cầu test từ web mỗi %ds",
            _DM_WEEKDAY + 2, _DM_HOUR, BUG_SYNC_TZ, BUG_SYNC_POLL_SECONDS,
        )


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
