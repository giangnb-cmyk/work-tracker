"""Enum tu DATA_MODEL.md + helper chuan hoa status/priority (nhan ca tieng Viet).

Giu nho gon va thuan tuy (pure): khong I/O, khong side-effect -> de test.
Nguon su that: d:/Project/bot-work-tracker/DATA_MODEL.md (phan Enums).
"""

# --- Task status ---
STATUS_TODO = "todo"
STATUS_IN_PROGRESS = "in_progress"
STATUS_REVIEW = "review"
STATUS_DONE = "done"
TASK_STATUSES = frozenset(
    {STATUS_TODO, STATUS_IN_PROGRESS, STATUS_REVIEW, STATUS_DONE}
)
# Thu tu cot Kanban (dung khi in bao cao cho dung thu tu).
STATUS_ORDER = (STATUS_TODO, STATUS_IN_PROGRESS, STATUS_REVIEW, STATUS_DONE)

# --- Task priority ---
PRIORITY_LOW = "low"
PRIORITY_MEDIUM = "medium"
PRIORITY_HIGH = "high"
PRIORITY_URGENT = "urgent"
TASK_PRIORITIES = frozenset(
    {PRIORITY_LOW, PRIORITY_MEDIUM, PRIORITY_HIGH, PRIORITY_URGENT}
)
PRIORITY_ORDER = (PRIORITY_URGENT, PRIORITY_HIGH, PRIORITY_MEDIUM, PRIORITY_LOW)

# --- Sprint status ---
SPRINT_PLANNING = "planning"
SPRINT_ACTIVE = "active"
SPRINT_COMPLETED = "completed"
SPRINT_STATUSES = frozenset({SPRINT_PLANNING, SPRINT_ACTIVE, SPRINT_COMPLETED})

# --- User role ---
# owner > admin > member (migration 0037). Owner ke thua moi quyen admin, nen o phia
# bot cu gom ca hai vao ADMIN_ROLES — bot khong phan biet owner/admin (viec cap/doi
# vai tro chi lam tren web, bot khong co skill do).
ROLE_OWNER = "owner"
ROLE_ADMIN = "admin"
ROLE_MEMBER = "member"
ADMIN_ROLES = frozenset({ROLE_OWNER, ROLE_ADMIN})

# Bang dong nghia: chap nhan bien the tieng Viet / khong dau / viet tat.
# Key deu la chu thuong, khong dau (goi normalize truoc khi tra cuu).
_STATUS_SYNONYMS = {
    "todo": STATUS_TODO,
    "to do": STATUS_TODO,
    "can lam": STATUS_TODO,
    "chua lam": STATUS_TODO,
    "moi": STATUS_TODO,
    "in_progress": STATUS_IN_PROGRESS,
    "in progress": STATUS_IN_PROGRESS,
    "inprogress": STATUS_IN_PROGRESS,
    "doing": STATUS_IN_PROGRESS,
    "dang lam": STATUS_IN_PROGRESS,
    "dang tien hanh": STATUS_IN_PROGRESS,
    "wip": STATUS_IN_PROGRESS,
    "review": STATUS_REVIEW,
    "reviewing": STATUS_REVIEW,
    "dang review": STATUS_REVIEW,
    "cho duyet": STATUS_REVIEW,
    "kiem tra": STATUS_REVIEW,
    "done": STATUS_DONE,
    "xong": STATUS_DONE,
    "hoan thanh": STATUS_DONE,
    "da xong": STATUS_DONE,
    "complete": STATUS_DONE,
    "completed": STATUS_DONE,
}

_SPRINT_STATUS_SYNONYMS = {
    "planning": SPRINT_PLANNING,
    "plan": SPRINT_PLANNING,
    "chuan bi": SPRINT_PLANNING,
    "sap toi": SPRINT_PLANNING,
    "ke hoach": SPRINT_PLANNING,
    "len ke hoach": SPRINT_PLANNING,
    "active": SPRINT_ACTIVE,
    "dang chay": SPRINT_ACTIVE,
    "chay": SPRINT_ACTIVE,
    "dang dien ra": SPRINT_ACTIVE,
    "mo": SPRINT_ACTIVE,
    "completed": SPRINT_COMPLETED,
    "complete": SPRINT_COMPLETED,
    "xong": SPRINT_COMPLETED,
    "da xong": SPRINT_COMPLETED,
    "hoan thanh": SPRINT_COMPLETED,
    "ket thuc": SPRINT_COMPLETED,
    "dong": SPRINT_COMPLETED,
}

_PRIORITY_SYNONYMS = {
    "low": PRIORITY_LOW,
    "thap": PRIORITY_LOW,
    "medium": PRIORITY_MEDIUM,
    "med": PRIORITY_MEDIUM,
    "normal": PRIORITY_MEDIUM,
    "binh thuong": PRIORITY_MEDIUM,
    "trung binh": PRIORITY_MEDIUM,
    "high": PRIORITY_HIGH,
    "cao": PRIORITY_HIGH,
    "urgent": PRIORITY_URGENT,
    "gap": PRIORITY_URGENT,
    "khan": PRIORITY_URGENT,
    "khan cap": PRIORITY_URGENT,
    "cuc gap": PRIORITY_URGENT,
}

# Ban do bo dau tieng Viet -> ASCII de match dong nghia du nguoi go co dau.
_DIACRITICS = str.maketrans(
    "àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ"
    "ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ",
    "aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd"
    "AAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD",
)


def _fold(text: str) -> str:
    """Chuan hoa: bo dau, ve chu thuong, gom khoang trang. Pure."""
    folded = text.strip().lower().translate(_DIACRITICS)
    return " ".join(folded.split())


def normalize_status(value: str):
    """Tra ve status hop le hoac None neu khong nhan dien duoc."""
    if not value:
        return None
    return _STATUS_SYNONYMS.get(_fold(value))


def normalize_priority(value: str):
    """Tra ve priority hop le hoac None neu khong nhan dien duoc."""
    if not value:
        return None
    return _PRIORITY_SYNONYMS.get(_fold(value))


def normalize_sprint_status(value: str):
    """Tra ve sprint status hop le hoac None neu khong nhan dien duoc."""
    if not value:
        return None
    return _SPRINT_STATUS_SYNONYMS.get(_fold(value))


def parse_ymd(value: str):
    """'YYYY-MM-DD' -> datetime. Nem ValueError neu sai dinh dang. Pure."""
    from datetime import datetime

    return datetime.strptime(value.strip(), "%Y-%m-%d")


def end_of_work_week(d):
    """Thu Sau 23:59:59 cua tuan hien tai. Pure.

    Cong thuc giong het endOfWorkWeek() ben web (web/src/lib/format.ts) de task tao
    tu Discord va tu web co cung han mac dinh. Thu 7/CN -> nhay sang thu Sau tuan sau.
    """
    from datetime import timedelta

    friday = 5
    # isoweekday(): T2=1..CN=7. '% 7' ep ve dung he cua Date.getDay() ben JS (CN=0..T7=6).
    diff = friday - (d.isoweekday() % 7)
    if diff < 0:
        diff += 7
    return (d + timedelta(days=diff)).replace(hour=23, minute=59, second=59, microsecond=0)
