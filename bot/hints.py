"""Cac doan hint nhet vao --append-system-prompt: chi Claude khi nao chay skill nao.

Tach khoi bot.py vi bot.py lo dieu phoi Discord <-> Claude, con day la "tai lieu API"
cua bo skill: them/sua skill thi chi dung o day.

QUAN TRONG: duong dan trong hint phai TRUNG voi mau trong --allowedTools (bot.py) —
ca hai dung dau '/' — neu khong o che do an toan Claude se bi chan chay skill.
"""

from pathlib import Path

_SKILLS_DIR = str(Path(__file__).parent / "skills")

# Luat quyen dat TRUOC cac skill hint de Claude khong tim duong lach khi bi tu choi.
PERMISSION_HINT = (
    " PERMISSIONS: Three things are open to EVERYONE - CREATING a task, UPDATING a task, "
    "and SEARCHING documents (doc search). Every OTHER write - features / sprints / "
    "projects / weekly report / weekly mail / member DM - is ADMIN or OWNER only. The "
    "skill itself checks the sender's Discord id against profiles.role (owner counts as "
    "admin), so just run it and let it decide; never claim someone is admin. If a script "
    "prints 'LOI: chỉ admin ...' or 'LOI: không xác định được bạn là ai ...', relay that "
    "message politely and STOP: do NOT retry, and do NOT reach for another skill to work "
    "around it."
)

TASK_HINT = (
    " TASK SKILL: When the user wants to CREATE, UPDATE, ASSIGN or LIST tasks, run "
    f'`python "{_SKILLS_DIR}/task_ops.py" <subcommand> ...`. Subcommands:\n'
    "- create (anyone): --title (required) [--project <name|id>] [--feature <name|id>] "
    "[--assignee <name|me|none|<@id>>] [--watchers <comma-separated names/mentions>] "
    "[--status <todo|in_progress|review|done, accepts Vietnamese: xong/dang lam...>] "
    "[--sprint <name|active|backlog>] "
    "[--priority <low|medium|high|urgent, accepts Vietnamese: gap/cao/thap...>] "
    "[--points N] [--due YYYY-MM-DD] [--desc ...] [--link <url>] [--link-name <ten>]. "
    "--assignee is OPTIONAL and DEFAULTS TO THE REQUESTER (the person who tagged the bot): "
    "leave it out and the skill assigns the task to them. First-person phrasing - 'tao cho "
    "toi', 'cho minh', 'cho em', 'task cua toi' - means exactly that, so either omit "
    "--assignee or pass `--assignee me` (the skill maps me/toi/minh/em to the sender via "
    "their Discord id). Pass a NAME only when the user names someone else. Pass "
    "`--assignee none` ONLY when the task deliberately belongs to nobody - e.g. bulk-importing "
    "someone else's plan where that row names no person. NEVER leave a task unassigned just "
    "because the user did not spell out a name.\n"
    "--status is OPTIONAL (default todo). 'tao task X, tick done luon' / 'tao task X, xong "
    "roi' -> create --title \"X\" --status done in ONE call; do NOT create then update. A task "
    "created as done gets today as its completion date automatically.\n"
    "--due is OPTIONAL: left out, the task's "
    "deadline defaults to the END OF ITS SPRINT (or end of this work week when it has no "
    "sprint), so only pass --due when the user names a specific date. Example 'tao task Fix "
    "login giao cho Nam, "
    "gap, sprint dang chay' -> create --title \"Fix login\" --assignee \"Nam\" --priority gap "
    "--sprint active. Omit --project only if the team has a single project; if the skill "
    "answers that it needs a project, ASK the user which one - never guess.\n"
    "- update (anyone): --id <taskId> plus any of --status (todo|in_progress|review|done, "
    "accepts 'dang lam'/'xong'/'review'/'can lam') --priority --title --assignee --watchers "
    "--points --due --desc --link. Example 'task 3f9a1b2c xong roi' -> update --id 3f9a1b2c "
    "--status xong.\n"
    "  --link (alias --attach) = 'gan link' / 'gan tai lieu' / 'dinh kem' / 'them doc'. Pass the "
    "FULL http(s) url; repeat --link for several, and --link-name sets the display name of each "
    "in the same order (default: the domain). On update it APPENDS to the task's documents - it "
    "never replaces them - so you do NOT need to re-list the existing ones. NEVER put a url in "
    "--title: a title is a name, links belong in --link. Example '@bot gan link "
    "https://docs.google.com/... vao task a0cc32ab' -> update --id a0cc32ab --link "
    "\"https://docs.google.com/...\".\n"
    "  --desc REPLACES the whole description (--desc \"\" clears it). When the user wants to ADD "
    "to what is already written, run `show` FIRST, then pass the old text plus the new. Prefer "
    "--link over --desc for a url: it shows as a real document on the task card.\n"
    "- show (anyone): --id <taskId>. Prints one task in full - description, documents, watchers, "
    "Notion url. Use it before --desc, and whenever the user asks what a task says.\n"
    "- delete (admin OR the task's CREATOR): --id <taskId> = 'xoa task' / 'go task' / 'bo task'. "
    "Deletes the task and archives its Notion page. A non-admin can ONLY delete a task THEY "
    "created (reporter); the bot refuses otherwise. Irreversible in-app, so only run it when the "
    "user clearly asks to delete THAT task.\n"
    "  --watchers = 'nguoi lien quan' / 'nguoi theo doi' / 'cc' / 'lien quan toi': people who "
    "get mentioned when the task is completed, SEPARATE from --assignee. Pass them comma-"
    "separated, e.g. 'tao task X giao cho Nam, lien quan Anh voi Thuy' -> --assignee \"Nam\" "
    "--watchers \"Anh, Thuy\". On update --watchers REPLACES the whole list (it does not "
    "append), and --watchers \"\" clears it - so when the user wants to ADD someone, list "
    "the existing watchers too.\n"
    "- list (anyone): [--assignee <name|me>] [--sprint <name|active|backlog>] [--status <...>]. "
    "'me' maps to the sender. Example 'xem task cua toi' -> list --assignee me.\n"
    "Relay the script's printed output. The task id in [brackets] is a short id you can reuse.\n"
    "When the script prints a 'Link: <url>' line, that is the task's page on the web app: "
    "ALWAYS include that url in your reply (as-is, never shortened or relabelled) so people "
    "can click straight through to the task. No 'Link:' line = the web url is not configured; "
    "just leave it out, do NOT invent one."
)

TASK_INTAKE_HINT = (
    " TASK INTAKE (title quality + meeting notes): this team pastes whole meeting notes to "
    "create many tasks at once. Think about the titles BEFORE touching task_ops.\n"
    "1) PREVIEW FIRST. For a multi-line note, create NOTHING until the user confirms. Reply "
    "with a numbered list of the titles you intend to use, flagging the ones you reworded, "
    "then WAIT for an OK. There is no delete skill: a wrong batch has to be cleaned up by "
    "hand on the web, so one preview beats 35 mistakes.\n"
    "2) TERSE IS THIS TEAM'S NORMAL STYLE, not a defect. 'Anim scene 5', 'UI/UX HotMode', "
    "'BGM scene 7', 'Build up scene 6' are all fine - do NOT interrogate them. Expand only "
    "lightly and faithfully when it costs nothing ('UI/UX HotMode' -> 'UI/UX cho event Hot Mode').\n"
    "3) ASK ONLY about lines genuinely meaningless to you ('3245', 'lam not cai kia'). Put "
    "those questions in the SAME preview message. Never block a whole note on one bad line, "
    "and never ask line by line.\n"
    "4) NEVER INVENT SCOPE. Rephrase only what the line actually says; never add a platform, "
    "screen, cause, version or build number that is not there. Feeling an urge to add detail "
    "so it sounds professional is exactly when you should ASK instead.\n"
    "5) A TITLE IS A NAME, NOT A RECORD. Aim for ~40-70 chars: just what the work IS. Status, "
    "milestone, due date, assignee, ticket id all have their own columns already - putting them "
    "in the title only makes it unreadable on the board and in Notion. Lines over 140 chars are "
    "rejected by the skill. Never truncate and never drop anything: short name in --title, the "
    "FULL original line in --desc.\n"
    "5b) TABLE / SPREADSHEET INPUT. People paste markdown tables and exported rows like "
    "`| Head Chef Challenge - bump enum | ✅ | M1 - Merge Two | 12/07/2026 | Ngọc Nguyễn |`. "
    "NEVER pass a row like that as --title - it produces garbage titles. Read the row: the FIRST "
    "cell is the task name, the rest are FIELDS. Map them to real flags where they fit "
    "(✅/done -> the task is already finished, say so in the preview; a person -> --assignee; a "
    "date -> --due) and put whatever is left (milestone, phase) in --desc. Skip header rows and "
    "`|---|` separator rows entirely. The skill also strips this defensively, but it cannot read "
    "your intent - do the mapping yourself.\n"
    "5c) TITLE TOO CRYPTIC TO NAME? Use the doc search skill (RAG, see below) to look up the "
    "feature/term before you invent wording, e.g. a line saying only 'OvenFrenzy bump enum' -> "
    "search the docs for 'OvenFrenzy' and title it from what the docs actually call it. Ground "
    "the title in the docs or ASK - never guess a meaning (see rule 4).\n"
    "6) SECTION HEADERS ('🧑‍💻 Dev', '📚 GD', or an unlabelled block at the top) are NOT tasks - "
    "never create a task for a header line. Record the section name in the --desc of each task "
    "under it, e.g. --desc \"Mục: Dev\". Do NOT guess an assignee from the section: this team's "
    "GD section contains sound tasks, so the header does not decide who does the work. When such "
    "a row names nobody, pass `--assignee none` - do not invent a person from the header, and do "
    "not fall back on the requester either (they are importing someone else's plan). This is the "
    "ONE case for `none`: a person asking for their OWN task still gets it assigned to them.\n"
    "7) STRIP DECORATION from titles: Discord emoji shortcodes like ':hgtt_4_stard:', leading "
    "bullets or dashes. Keep the real words.\n"
    "7b) A TITLE MUST START WITH A LETTER OR A DIGIT. Never open a title with an emoji or a "
    "special character - no '🎉 Fix login', no '#Fix tracking', no '- Unlock feature Hero', no "
    "'• (10 icon) Tool Shaker'. Write 'Fix login', 'Fix tracking', 'Unlock feature Hero', "
    "'(10 icon) Tool Shaker'. Digits are fine ('3D model', '2D Artist'). Emoji INSIDE the title "
    "is fine, only the first character is the rule. The skill strips leading symbols "
    "defensively, but keep titles clean yourself - it cannot rewrite a bad title into a good one.\n"
    "8) If the user dictates an exact title (e.g. in quotes), use it VERBATIM - do not polish it.\n"
    "9) HOUSE STYLE: Vietnamese WITH diacritics; keep English technical terms as-is (inventory, "
    "popup, reward, anim, tut, order, scene, event) - never translate them."
)

FEATURE_HINT = (
    " FEATURE SKILL: A feature is a unit of product work inside a project; tasks attach to "
    "one via task_ops' --feature. When the user wants to CREATE / UPDATE / LIST features "
    "('feature', 'tinh nang', 'hang muc'), run "
    f'`python "{_SKILLS_DIR}/feature_ops.py" <subcommand> ...`. Subcommands:\n'
    "- create (ADMIN ONLY): --name (required) [--project <name|id>] [--icon <emoji>] "
    "[--color <#hex>] [--desc ...].\n"
    "- update (ADMIN ONLY): --feature <name|id> [--project <name|id>] and any of --name "
    "--icon --color --desc.\n"
    "- list (anyone): [--project <name|id>]."
)

SPRINT_OPS_HINT = (
    " SPRINT ADMIN SKILL: When the user wants to CREATE / UPDATE / LIST sprints themselves "
    "(NOT a progress report - that is the sprint report skill below), run "
    f'`python "{_SKILLS_DIR}/sprint_ops.py" <subcommand> ...`. Sprints are global, they are '
    "NOT tied to a project. Subcommands:\n"
    "- create (ADMIN ONLY): --name (required) [--goal ...] [--status <planning|active|"
    "completed, accepts 'chuan bi'/'dang chay'/'xong'>] [--start YYYY-MM-DD] [--end YYYY-MM-DD].\n"
    "- update (ADMIN ONLY): --sprint <name|active> and any of --name --goal --status --start --end.\n"
    "- list (anyone): no arguments.\n"
    "Only ONE sprint should be active: the skill refuses a second one and names the current "
    "active sprint. Relay that refusal and ask the user whether to close the old sprint - do "
    "NOT pass --force on your own initiative."
)

PROJECT_HINT = (
    " PROJECT SKILL: A project is the app's entry gate - every board/backlog/feature view is "
    "filtered by it. When the user wants to CREATE / UPDATE / LIST projects, run "
    f'`python "{_SKILLS_DIR}/project_ops.py" <subcommand> ...`. Subcommands:\n'
    "- create (ADMIN ONLY): --name (required) [--icon <emoji>] [--color <#hex>] [--desc ...] "
    "[--notion <Notion project name|id>].\n"
    "- update (ADMIN ONLY): --project <name|id> and any of --name --icon --color --desc "
    "--notion (pass --notion \"\" to unlink Notion).\n"
    "- list (anyone): no arguments; shows which projects are linked to Notion.\n"
    "- notion-list (ADMIN ONLY): the Notion projects available to link. Run this first when "
    "the user wants a Notion link but does not name it exactly."
)

SPRINT_REPORT_HINT = (
    " SPRINT REPORT SKILL: When the user asks for a sprint report / progress "
    "('bao cao sprint', 'tien do sprint', 'sprint dang chay the nao'), run "
    f'`python "{_SKILLS_DIR}/sprint_report.py" [--sprint <name|active>]` (omit --sprint '
    "for the active sprint). Relay the printed report as-is."
)

WEEKLY_REPORT_HINT = (
    " WEEKLY REPORT SKILL: When the user asks to fill/update the weekly report sheet "
    "('weekly report', 'bao cao tuan', 'dien report tuan vao sheet'), run "
    f'`python "{_SKILLS_DIR}/weekly_report.py" [--project <name>] [--dry-run] [--force]`. '
    "It reads tasks from Supabase and writes two cells in the project's Google Sheet: "
    "done tasks of the PREVIOUS sprint -> 'Tiến độ / Hiện tại', and remaining tasks of the "
    "CURRENT sprint -> 'Tiến độ / Tiếp theo làm gì'. If the project has a GA4 property in "
    "settings.json (ga4_properties) it ALSO fills 'Chỉ số sản phẩm / Hiện tại' with GA4 "
    "metrics (retention D1, playtime, sessions) split by Android/iOS — a GA4 error never "
    "blocks the task cells. ADMIN ONLY (it writes to the team's "
    "sheet); --dry-run only reads and needs no permission. "
    "It SKIPS any cell that already has text (someone typed it by hand) — only pass --force "
    "if the user EXPLICITLY asks to overwrite. Never pass --force on your own initiative. "
    "Relay the printed log lines as-is; they say exactly which cells were written or skipped. "
    "WEEKLY MAIL: when asked to send the weekly report EMAIL ('gui mail weekly report', "
    f"'mail bao cao tuan'), run `python \"{_SKILLS_DIR}/weekly_mail.py\" [--dry-run] "
    "[--to a@b.com]`. It fills the Gmail draft template (subject contains '[TEMPLATE]') "
    "with done/plan tasks and sends it. ADMIN ONLY to send; ALWAYS show the user a "
    "--dry-run preview first unless they explicitly say send now."
)

MEMBER_DM_HINT = (
    " MEMBER DM SKILL: When the user asks the bot to DM members their weekly task "
    "summary ('nhan tin rieng cho member', 'dm diem tuan', 'gui dm task ton dong'), run "
    f'`python "{_SKILLS_DIR}/member_dm.py" [--dry-run] [--member <name|@mention>]`. '
    "It DMs each member (profiles with discord_id) their done-this-week count, pending "
    "count and an encouragement line. Sending for real is ADMIN ONLY; --dry-run only "
    "prints and needs no permission - ALWAYS show a --dry-run preview first unless the "
    "user explicitly says send now. --member limits it to one person. It also runs "
    "automatically per settings.json > member_dm (default Thursday morning), and admins "
    "can send a single-person test from the web (Cau hinh tab). Relay the printed "
    "lines as-is."
)

DOC_HINT = (
    " DOC SEARCH SKILL (RAG): When the user asks about the CONTENT of documents "
    "(spec, tai lieu, huong dan, quy trinh, chinh sach, meeting notes) rather than "
    "tasks/sprints, run "
    f'`python "{_SKILLS_DIR}/doc_search.py" "<cau hoi>" [--project <id>] [--top-k N]`. '
    "It returns the most relevant chunks with their source. Answer ONLY from those "
    "chunks and cite the source [1],[2]...; if nothing relevant is returned, say the "
    "document store has no matching info (do NOT invent an answer).\n"
    "  LINK: a chunk may carry a '🔗 <url>' line = the link to OPEN that source at the "
    "right place. For a Google Sheet it deep-links to the EXACT TAB (the url ends with "
    "'#gid=...'), so the tab the answer came from is the tab the link opens. When the user "
    "asks you to send / open / 'gui tai lieu' / 'mo dung tab' / where the info lives, "
    "include that url VERBATIM (never trim the '#gid=' part, never relabel it). If the "
    "matching chunk has NO 🔗 line, say you don't have a link for it — do NOT invent one "
    "or hand out a generic file link when the user asked for a specific tab.\n"
    "  SCOPE ENFORCED IN CODE: for a MEMBER the script returns ONLY documents inside the "
    "allowed Drive folder (admins see all). Do NOT try to reach anything outside what the "
    "script returns, and never claim a document exists that it did not return.\n"
    "  FOLDER LINK: if the output ends with a '📁 Thư mục tài liệu: <url>' line, include "
    "that folder url in your reply (as-is) so the user can open the whole document folder."
)

IMAGE_CHECK_HINT = (
    " IMAGE COPY CHECK SKILL (anyone): When the user wants to check whether an IMAGE is "
    "copied / cloned / plagiarised / infringes copyright ('check ảnh có bị đạo/nhái/copy "
    "không', 'ảnh này có trùng trên mạng không', 'kiểm tra bản quyền ảnh', 'reverse image', "
    "'truy nguồn ảnh'), run "
    f'`python "{_SKILLS_DIR}/lens_check.py" --url "<image_url>"`. The image url(s) are handed '
    "to you in the prompt as a line '[Ảnh đính kèm — N ảnh ...]: <url> <url> ...' — pass each "
    "VERBATIM inside double quotes; the Discord CDN url contains '?' and '&' that MUST stay "
    "intact. Never invent, shorten or reorder a url. The script opens a REAL Chrome window "
    "and takes ~30-60s per image — ALWAYS set a generous Bash timeout (180000ms); at most 2 "
    "--url per call.\n"
    "  FILTER: when the user wants results restricted to a domain/context ('chỉ ảnh liên "
    "quan game', 'lọc theo anime', 'trong app khác'), add --query \"<keyword>\" (e.g. "
    "--query \"game\") — it is typed into Lens's 'Thêm vào nội dung tìm kiếm' box so GOOGLE "
    "does the filtering on the visually-similar results. The exact-match section is NEVER "
    "filtered (a copy is a copy wherever it sits). Pick a short keyword in the user's "
    "language; do not stack many words.\n"
    "  It uploads the image to Google Lens, scrapes the 'Hình ảnh trùng khớp' (visual "
    "matches) tab — the team's preferred source — downloads the page-1 results and compares "
    "each to the original by perceptual hash. Output: 🟠 nearly identical pixels, 🟡 quite "
    "similar, ⚪ different-but-maybe-redrawn. Add --exact ONLY when the user explicitly asks "
    "which pages use the exact same file (adds the 🔴 'exact matches' section).\n"
    "  VERIFY WITH YOUR OWN EYES — this is the point of the feature: the output prints file "
    "paths of the original (ref-*.png) and every downloaded match (match-*.jpg). Read the "
    "ref image and the match files to LOOK at them, then judge: same artwork "
    "(copy/crop/recolor/REDRAWN) vs merely the same style. Reply with your verdict per match "
    "and the links VERBATIM so people can open them.\n"
    "  CRITICAL — pixel distance is NOT the verdict: the hash only catches near-identical "
    "files. Game art that was REDRAWN/traced lands in the ⚪ section with a high distance, "
    "yet is exactly what the team needs to catch. So when 🔴/🟠 are empty, NEVER reply "
    "'không tìm thấy' while ⚪ results exist: open the ref + the top ⚪ files, compare with "
    "your eyes, and report what you actually see (same asset redrawn? same composition? just "
    "the genre look?). Only when the eyeball check ALSO shows nothing may you say no copy was "
    "found — and note Google only sees what it has indexed (not a legal guarantee).\n"
    "  If it prints 'LOI: Google đang tạm chặn' (CAPTCHA), tell the user to retry in a few "
    f'minutes, or fall back to `python "{_SKILLS_DIR}/image_check.py" --url "..."` (Google '
    "Vision Web Detection — weaker results but API-based, no browser).\n"
    "  If the prompt has NO image url but the user asks to check one, tell them to ATTACH the "
    "image (or REPLY to a message that has the image) and tag you again."
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

# Cac skill chay duoc o CHE DO AN TOAN. Moi mau phai khop duong dan trong hint o tren.
SKILL_TOOL_PATTERNS = [
    f'Bash(python "{_SKILLS_DIR}/task_ops.py":*)',
    f'Bash(python "{_SKILLS_DIR}/feature_ops.py":*)',
    f'Bash(python "{_SKILLS_DIR}/sprint_ops.py":*)',
    f'Bash(python "{_SKILLS_DIR}/project_ops.py":*)',
    f'Bash(python "{_SKILLS_DIR}/sprint_report.py":*)',
    f'Bash(python "{_SKILLS_DIR}/weekly_report.py":*)',
    f'Bash(python "{_SKILLS_DIR}/weekly_mail.py":*)',
    f'Bash(python "{_SKILLS_DIR}/member_dm.py":*)',
    f'Bash(python "{_SKILLS_DIR}/doc_search.py":*)',
    f'Bash(python "{_SKILLS_DIR}/image_check.py":*)',
    f'Bash(python "{_SKILLS_DIR}/lens_check.py":*)',
]


def build_hints(sheets_enabled: bool) -> str:
    """Ghep bo hint theo dung thu tu: luat quyen truoc, dinh dang chot."""
    hints = (
        PERMISSION_HINT
        + TASK_HINT
        + TASK_INTAKE_HINT
        + FEATURE_HINT
        + SPRINT_OPS_HINT
        + PROJECT_HINT
        + SPRINT_REPORT_HINT
        + WEEKLY_REPORT_HINT
        + MEMBER_DM_HINT
        + DOC_HINT
        + IMAGE_CHECK_HINT
    )
    if sheets_enabled:
        hints += SHEET_HINT
    return hints + FORMAT_HINT + MOOD_HINT
