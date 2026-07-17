"""Dung link web tro toi mot task, de thong bao Discord bam vao la mo dung task.

WEB_BASE_URL de trong -> tra ve "" (bo qua link, KHONG loi): bot van chay binh thuong
khi chua deploy web hoac lam viec o may local.
"""

import os

_BASE_ENV = "WEB_BASE_URL"


def base_url() -> str:
    """URL goc cua web, bo '/' thua o cuoi. Rong = chua cau hinh."""
    return (os.getenv(_BASE_ENV) or "").strip().rstrip("/")


def task_url(task_id: str) -> str:
    """Link mo TaskModal theo id. Rong neu chua dat WEB_BASE_URL hoac thieu id.

    WHY id DAY DU chu khong phai short_id: TaskDeepLink query .eq('id', taskId), id rut
    gon 8 ky tu lam Postgres nem loi cast uuid -> nguoi dung thay 'Không tìm thấy task'.
    Khong can '?p=<projectId>': TaskDeepLink tu chuyen sang du an cua task.
    """
    base = base_url()
    if not base or not task_id:
        return ""
    return f"{base}/tasks/{task_id}"
