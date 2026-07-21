"""Dung link web tro toi mot task, de thong bao Discord bam vao la mo dung task.

WEB_BASE_URL de trong -> dung DOMAIN MAC DINH (_DEFAULT_BASE) chu khong bo link nua:
nguoi dung muon thong bao luon co link tren domain moi. Muon domain khac thi dat
WEB_BASE_URL trong bot/.env.
"""

import os

_BASE_ENV = "WEB_BASE_URL"
# Domain production chinh tac (song song SHARE_BASE_URL ben web/src/lib/router.ts).
_DEFAULT_BASE = "https://m-plan.easygoing.vn"


def base_url() -> str:
    """URL goc cua web, bo '/' thua o cuoi. Chua dat WEB_BASE_URL -> domain mac dinh."""
    return ((os.getenv(_BASE_ENV) or "").strip() or _DEFAULT_BASE).rstrip("/")


def task_url(task_id: str) -> str:
    """Link mo TaskModal theo id DAY DU. Rong neu thieu id.

    WHY id DAY DU chu khong phai short_id: TaskDeepLink query .eq('id', taskId), id rut
    gon 8 ky tu lam Postgres nem loi cast uuid -> nguoi dung thay 'Không tìm thấy task'.
    Khong can '?p=<projectId>': TaskDeepLink tu chuyen sang du an cua task.
    """
    base = base_url()
    if not base or not task_id:
        return ""
    return f"{base}/tasks/{task_id}"


def task_short_url(short_code, task_id: str) -> str:
    """Link RUT GON /t/<short_code> (~6 ky tu) — dep hon /tasks/<uuid> dai ~80 ky tu.

    Chua co short_code (task cu) thi lui ve task_url(id) day du. Handler /t/<code> ben
    web tra task theo short_code roi tu chuyen du an.
    """
    if short_code:
        base = base_url()
        return f"{base}/t/{short_code}" if base else ""
    return task_url(task_id)
