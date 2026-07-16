"""Loi nghiep vu dung chung cho moi skill.

Tach rieng vi ca task_repo, project_repo lan permissions deu nem cung mot bo loi:
neu de o task_repo thi project_repo phai import nguoc lai mien khong lien quan.

Quy uoc: skill bat cac loi nay o main() -> in 'LOI: ...' va thoat non-zero.
Claude doc dong 'LOI:' do va thuat lai cho nguoi dung (xem FORMAT_HINT trong bot.py).
"""


class ResolveError(Exception):
    """Khong phan giai duoc user/sprint/project/feature tu token nguoi dung dua."""


class PermissionDenied(Exception):
    """Nguoi tag bot khong du quyen cho hanh dong nay.

    WHY: bot chay bang service_role key -> Postgres KHONG chan gi ca. Day la
    lop chan duy nhat, nen moi lenh ghi phai tu goi permissions.require_admin().
    """
