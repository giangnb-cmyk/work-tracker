"""Repository: bang `projects` va `features` (cung mien — cau truc cua mot project).

Giong task_repo.py: tra ve dict camelCase (+ '_id'), moi ham 1 viec, chay standalone duoc.
Ghi bang service_role (BO QUA RLS) -> quyen phai check o permissions.py truoc khi goi.
"""

import sys
from pathlib import Path

# WHY: khi chay `python skills/xxx.py` thi bot/ khong nam tren sys.path -> them vao.
_BOT_DIR = Path(__file__).resolve().parent.parent
if str(_BOT_DIR) not in sys.path:
    sys.path.insert(0, str(_BOT_DIR))

from supabase_client import get_client  # noqa: E402

from constants import _fold  # noqa: E402
from errors import ResolveError  # noqa: E402

PROJECTS = "projects"
FEATURES = "features"


def db():
    """Shortcut lay Supabase client Singleton."""
    return get_client()


# --- Mappers: row Postgres (snake_case) -> dict skill (camelCase, + '_id') -------

def _map_project(r: dict) -> dict:
    return {
        "_id": r["id"],
        "id": r["id"],
        "name": r.get("name", ""),
        "icon": r.get("icon", "📁"),
        "color": r.get("color", "#6366f1"),
        "description": r.get("description", ""),
        "notionProjectId": r.get("notion_project_id"),
    }


def _map_feature(r: dict) -> dict:
    return {
        "_id": r["id"],
        "id": r["id"],
        "projectId": r.get("project_id"),
        "name": r.get("name", ""),
        "icon": r.get("icon", "🧩"),
        "color": r.get("color", "#6366f1"),
        "description": r.get("description", ""),
    }


# camelCase (skill) -> snake_case (column) for writes.
_PROJECT_COL = {
    "name": "name",
    "icon": "icon",
    "color": "color",
    "description": "description",
    "notionProjectId": "notion_project_id",
    "createdBy": "created_by",
}

_FEATURE_COL = {
    "projectId": "project_id",
    "name": "name",
    "icon": "icon",
    "color": "color",
    "description": "description",
    "createdBy": "created_by",
}


def _row(fields: dict, columns: dict) -> dict:
    """Ep dict camelCase -> row snake_case, bo qua khoa server-managed."""
    return {columns[k]: v for k, v in fields.items() if k in columns}


# --- Tra cuu dung chung ---------------------------------------------------

def _by_id(client, table: str, value: str, mapper):
    """Khop id (uuid). None neu khong co / token khong phai uuid hop le."""
    try:
        res = client.table(table).select("*").eq("id", value).limit(1).execute()
    except Exception:
        return None  # token khong phai uuid -> de nguoi goi thu khop theo ten
    return mapper(res.data[0]) if res.data else None


def _match_name(client, table: str, name: str, mapper, project_id=None):
    """Khop ten: chinh xac (khong dau) truoc, roi mot phan.

    Nhieu ket qua khop mot phan -> nem ResolveError liet ke ra, KHONG doan bua
    (tranh 'Web' am tham trung 'Web Admin').
    """
    q = client.table(table).select("*")
    if project_id:
        q = q.eq("project_id", project_id)
    rows = q.execute().data or []

    target = _fold(name)
    exact = [r for r in rows if _fold(r.get("name", "")) == target]
    if exact:
        return mapper(exact[0])

    partial = [r for r in rows if target and target in _fold(r.get("name", ""))]
    if len(partial) > 1:
        found = ", ".join(f"'{r.get('name', '')}'" for r in partial)
        raise ResolveError(f"'{name}' khớp nhiều mục: {found} — nói rõ tên đầy đủ giúp tôi")
    return mapper(partial[0]) if partial else None


def _names(items: list) -> str:
    """Liet ke ten de nhet vao cau bao loi."""
    return ", ".join(f"'{i['name']}'" for i in items) or "(chưa có)"


# --- Projects -------------------------------------------------------------

def list_projects(client) -> list:
    """Moi project, sap theo ten."""
    rows = client.table(PROJECTS).select("*").order("name").execute().data
    return [_map_project(r) for r in rows or []]


def resolve_project(client, token: str):
    """Phan giai project tu uuid hoac ten. Token rong -> project duy nhat (neu chi co 1).

    Nem ResolveError kem danh sach khi mo ho -> Claude hoi lai thay vi doan.
    """
    token = (token or "").strip()
    if not token:
        projects = list_projects(client)
        if len(projects) == 1:
            return projects[0]
        if not projects:
            raise ResolveError("chưa có project nào trong hệ thống")
        raise ResolveError(f"cần nói rõ project nào, đang có: {_names(projects)}")

    hit = _by_id(client, PROJECTS, token, _map_project)
    if hit:
        return hit
    hit = _match_name(client, PROJECTS, token, _map_project)
    if not hit:
        raise ResolveError(f"không tìm thấy project '{token}', đang có: {_names(list_projects(client))}")
    return hit


def insert_project(client, fields: dict) -> str:
    """Chen project moi tu dict camelCase. Tra ve id (uuid) vua tao."""
    res = client.table(PROJECTS).insert(_row(fields, _PROJECT_COL)).execute()
    return res.data[0]["id"]


def update_project(client, project_id: str, fields: dict) -> None:
    """Cap nhat project theo id tu dict camelCase."""
    client.table(PROJECTS).update(_row(fields, _PROJECT_COL)).eq("id", project_id).execute()


# --- Features -------------------------------------------------------------

def list_features(client, project_id: str) -> list:
    """Moi feature cua 1 project, sap theo ten."""
    rows = client.table(FEATURES).select("*").eq("project_id", project_id).order("name").execute().data
    return [_map_feature(r) for r in rows or []]


def resolve_feature(client, project_id: str, token: str):
    """Phan giai feature TRONG 1 project tu uuid hoac ten. Nem ResolveError neu khong ro."""
    token = (token or "").strip()
    if not token:
        raise ResolveError("cần nói rõ feature nào")

    hit = _by_id(client, FEATURES, token, _map_feature)
    # WHY: id co the thuoc project khac -> chan cheo project cho chac.
    if hit and hit["projectId"] == project_id:
        return hit
    hit = _match_name(client, FEATURES, token, _map_feature, project_id=project_id)
    if not hit:
        found = _names(list_features(client, project_id))
        raise ResolveError(f"không tìm thấy feature '{token}' trong project này, đang có: {found}")
    return hit


def insert_feature(client, fields: dict) -> str:
    """Chen feature moi tu dict camelCase. Tra ve id (uuid) vua tao."""
    res = client.table(FEATURES).insert(_row(fields, _FEATURE_COL)).execute()
    return res.data[0]["id"]


def update_feature(client, feature_id: str, fields: dict) -> None:
    """Cap nhat feature theo id tu dict camelCase."""
    client.table(FEATURES).update(_row(fields, _FEATURE_COL)).eq("id", feature_id).execute()
