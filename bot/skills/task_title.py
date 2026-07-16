"""Lam sach tieu de task truoc khi ghi DB. Thuan — khong DB, khong I/O, de test.

Vi sao can: hint trong hints.py chi la KHUYEN NGHI, Claude van co the be nguyen mot
dong bang markdown lam --title. Da tung xay ra that: ca dong
'| Head Chef Challenge - bump enum ... | ✅ | M1 - Merge Two | 12/07/2026 | Ngoc ... |'
bi day thang len Notion lam ten trang. Day la tang chan cuoi cung o phia code.

Nguyen tac: KHONG vut du lieu. Phan bi cat khoi tieu de duoc tra ve de goi vao --desc.
"""

import re

MAX_TITLE = 140  # khop check constraint char_length(title) between 1 and 140

# Rac o dau dong: bullet, dau gach, so thu tu, checkbox markdown.
_LEADING_JUNK = re.compile(r"^(?:[-*•·–—]+\s*|\d+[.)]\s+|\[[ xX]\]\s*|#+\s+)+")
# Emoji shortcode kieu Discord (:hgtt_4_stard:) — giu emoji unicode that.
_EMOJI_CODE = re.compile(r":[a-z0-9_+-]{2,}:", re.IGNORECASE)
_WS = re.compile(r"\s+")
# Dong ngan cach cua bang markdown: |---|:---:|
_TABLE_SEP = re.compile(r"^[\s|:-]+$")

# Cap mo/dong duoc GIU o dau tieu de: cat di se lam hong cap, te hon la de nguyen.
# '(10 icon) Tool Shaker' -> cat '(' thanh '10 icon) Tool Shaker'.
_OPENERS = {"(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "«": "»", "“": "”"}


def _strip_leading_symbols(s: str) -> str:
    """Bo moi ky tu khong phai chu/so o DAU tieu de (emoji, dau cham, ky hieu).

    Luat cua team: ky tu dau tien cua title Notion phai la chu hoac so — khong emoji,
    khong ky tu dac biet. Chi xet o DAU: emoji giua cau van duoc giu.

    So VAN hop le o dau ('3D model', '2D Artist', '10 icon ...') — 'chu cai dau tien'
    o day hieu la khong-phai-rac, chu khong phai cam chu so.
    """
    while s:
        ch = s[0]
        if ch.isalnum():
            return s
        if ch in _OPENERS and _OPENERS[ch] in s[1:]:
            return s  # dau mo co dau dong -> la noi dung that
        s = s[1:].lstrip()
    return s


def _looks_like_table_row(s: str) -> bool:
    """Chi nhan dien khi dau hieu ro rang, de khong bam nham tieu de co dau '|' that."""
    return s.startswith("|") or s.count("|") >= 2


def _split_cells(s: str) -> list[str]:
    return [c.strip() for c in s.strip().strip("|").split("|") if c.strip()]


def _strip_decoration(s: str) -> str:
    s = _LEADING_JUNK.sub("", s)
    s = _EMOJI_CODE.sub("", s)
    s = _WS.sub(" ", s).strip()
    return _strip_leading_symbols(s)


def clean_title(raw: str) -> tuple[str, str]:
    """Tra (title, phan_thua).

    `phan_thua` la thong tin bi tach khoi tieu de, PHAI duoc noi vao --desc chu khong
    vut di. Chuoi rong nghia la khong co gi bi tach.

    Tieu de qua dai KHONG bi cat cut o day: tra ve nguyen ven de cmd_create bao loi va
    Claude tu dat lai tieu de cho tu te (xem TASK_INTAKE_HINT) — tu dong cat giua chung
    se de lai nhung tieu de cut duoi kieu 'Lam man hinh nap tien va xu ly loi khi ngu'.
    """
    s = (raw or "").strip()
    if not s:
        return "", ""

    extras: list[str] = []
    if _looks_like_table_row(s):
        if _TABLE_SEP.match(s):
            return "", ""  # dong ke cua bang, khong phai task
        cells = _split_cells(s)
        if cells:
            # O dau tien la ten viec; cac o sau la trang thai / milestone / ngay / nguoi
            # — chung da co cot rieng trong DB roi, nhet vao tieu de chi lam ban.
            s = cells[0]
            extras = cells[1:]

    title = _strip_decoration(s)
    extra_text = " · ".join(extras) if extras else ""
    return title, extra_text


def merge_desc(desc: str | None, extra: str) -> str:
    """Ghep phan thua vao mo ta, giu nguyen mo ta nguoi dung da nhap."""
    base = (desc or "").strip()
    if not extra:
        return base
    line = f"Từ bảng gốc: {extra}"
    return f"{base}\n{line}".strip() if base else line
