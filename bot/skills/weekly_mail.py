"""Skill CLI: soan + gui mail weekly report tu TEMPLATE DRAFT trong Gmail.

Luong: doc task tu Supabase (CUNG nguon voi weekly_report.py — sheet va mail luon khop
nhau) -> lay draft template trong Gmail -> thay placeholder -> gui.

TEMPLATE: la mot DRAFT trong hop thu (muc "Templates" cua Gmail API khong doc duoc),
subject chua "[TEMPLATE]" (doi duoc trong settings). Trong subject/body dat placeholder:
    {{START}} {{END}}            ngay dau/cuoi tuan, dd/mm      (subject kieu "[20/04 - 26/04]")
    {{START_FULL}} {{END_FULL}}  dd/mm/yyyy                     (dong "Thời gian:")
    {{DONE}}                     task DA XONG sprint truoc, moi task mot dong "- ..."
    {{PLAN}}                     task CON LAI sprint hien tai
    {{SHEET_URL}}                link Google Sheet weekly report cua project (tuy chon)
Placeholder nao khong co trong template thi bo qua; {{DONE}}/{{PLAN}} khong co thi BAO
LOI — vi day chinh la phan can cap nhat moi tuan.

Cau hinh settings.json > "weekly_mail": enabled, weekday, hour, template_subject, to, cc.
ADMIN ONLY khi gui that; --dry-run chi in ra, khong gui.

Vi du (chay trong thu muc bot/):
    python skills/weekly_mail.py --dry-run
    python skills/weekly_mail.py --to someone@x.com   # ghi de nguoi nhan 1 lan
"""

import argparse
import html as html_mod
import json
import sys
from datetime import date, datetime
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import gmail_gateway as gmail
import permissions
import project_repo as prepo
import task_repo as repo
import weekly_report as wr
from errors import PermissionDenied, ResolveError

_SETTINGS_FILE = Path(__file__).resolve().parent.parent / "settings.json"
_DATE = "%d/%m"
_DATE_FULL = "%d/%m/%Y"


def config() -> dict:
    try:
        settings = json.loads(_SETTINGS_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return settings.get("weekly_mail", {}) or {}


def _bullets_html(text: str) -> str:
    """Cac dong '- tieu de' (plain) -> HTML, giu dung kieu gach dau dong trong mail mau."""
    lines = [html_mod.escape(line) for line in text.splitlines() if line.strip()]
    return "<br>".join(lines) if lines else "(không có)"


def fill_template(tpl: str, values: dict[str, str]) -> str:
    for key, val in values.items():
        tpl = tpl.replace("{{" + key + "}}", val)
    return tpl


def build_mail(project_token: str | None = None, week: date | None = None) -> dict:
    """Soan mail tu du lieu that + template draft. Tra ve {subject, html, to, cc, ...}."""
    cfg = config()
    client = repo.db()
    project = (prepo.resolve_project(client, project_token) if project_token
               else wr._only_project(client))

    previous, current = wr.sprint_pair(client)
    if not current:
        raise gmail.GmailError("chưa có sprint nào có ngày bắt đầu — không biết báo cáo tuần nào.")
    done_text, plan_text = wr.build_sections(client, previous, current)
    start, end = wr._target_week(current, week)

    sess = gmail.session()
    tpl = gmail.find_template_draft(sess, cfg.get("template_subject", "[TEMPLATE]"))
    if "{{DONE}}" not in tpl["html"] or "{{PLAN}}" not in tpl["html"]:
        raise gmail.GmailError(
            "template thiếu placeholder {{DONE}} / {{PLAN}} — mở draft template và đặt "
            "chúng vào phần 'Nội dung hoàn thành' / 'Kế hoạch tuần tới'."
        )

    sheet_id = (project.get("weeklySheetId") or "").strip()
    values = {
        "START": start.strftime(_DATE),
        "END": end.strftime(_DATE) if end else "",
        "START_FULL": start.strftime(_DATE_FULL),
        "END_FULL": end.strftime(_DATE_FULL) if end else "",
        "DONE": _bullets_html(done_text),
        "PLAN": _bullets_html(plan_text),
        "SHEET_URL": f"https://docs.google.com/spreadsheets/d/{sheet_id}" if sheet_id else "",
    }
    # Subject: bo danh dau "[TEMPLATE]" roi moi thay ngay.
    subject = fill_template(
        tpl["subject"].replace(cfg.get("template_subject", "[TEMPLATE]"), "").strip(),
        values,
    )
    # CO Y khong tra ve session: mail co the nam cho DUYET hang gio, token bearer het
    # han sau ~1h — send_built tu mo session moi (tu refresh) luc gui that.
    return {
        "subject": subject,
        "html": fill_template(tpl["html"], values),
        "to": list(cfg.get("to", [])),
        "cc": list(cfg.get("cc", [])),
        "project": project.get("name", "?"),
        "done_count": len(done_text.splitlines()),
        "plan_count": len(plan_text.splitlines()),
    }


def send_built(mail: dict) -> str:
    """Gui mot mail da build_mail() xong. Tra ve message id."""
    return gmail.send_html(gmail.session(), mail["to"], mail["cc"], mail["subject"], mail["html"])


def _html_to_text(html_str: str) -> str:
    import re
    s = re.sub(r"(?i)<\s*(br|/p|/div|/li|/tr)[^>]*>", "\n", html_str)
    s = re.sub(r"<[^>]+>", "", s)
    s = html_mod.unescape(s)
    s = re.sub(r"[ \t]+", " ", s)
    return re.sub(r"\n{3,}", "\n\n", s).strip()


def preview_text(mail: dict, limit: int = 1500) -> str:
    """Ban xem truoc de DM cho admin duyet — Discord gioi han 2000 ky tu/tin."""
    body = _html_to_text(mail["html"])
    if len(body) > limit:
        body = body[:limit] + "…"
    return (
        f"📧 **Weekly mail chờ duyệt** — {mail['project']}\n"
        f"**Subject:** {mail['subject']}\n"
        f"**To:** {', '.join(mail['to']) or '(chưa cấu hình!)'}"
        + (f" · **Cc:** {', '.join(mail['cc'])}" if mail["cc"] else "") + "\n"
        f"({mail['done_count']} task xong · {mail['plan_count']} task kế hoạch)\n"
        f"─────\n{body}"
    )


def run(project_token: str | None, dry_run: bool, to_override: list[str],
        cc_override: list[str], week: date | None = None) -> list[str]:
    """Duong chay dung chung cho CLI va lich tu dong trong bot.py."""
    mail = build_mail(project_token, week)
    to = to_override or mail["to"]
    cc = cc_override or mail["cc"]
    head = [
        f"Project: {mail['project']} · {mail['done_count']} task xong · {mail['plan_count']} task kế hoạch",
        f"Subject: {mail['subject']}",
        f"To: {', '.join(to) or '(chưa cấu hình!)'}" + (f" · Cc: {', '.join(cc)}" if cc else ""),
    ]
    if dry_run:
        return head + ["", "(--dry-run: chưa gửi. Body HTML dài "
                       f"{len(mail['html'])} ký tự, xem thử bằng --dump-html)"]
    msg_id = send_built({**mail, "to": to, "cc": cc})
    return head + [f"ĐÃ GỬI (message id {msg_id})"]


def main():
    parser = argparse.ArgumentParser(description="Gui mail weekly report tu template Gmail.")
    parser.add_argument("--project", default=None, help="Ten hoac id project (bo qua neu chi co 1)")
    parser.add_argument("--dry-run", action="store_true", help="Chi in ra, khong gui")
    parser.add_argument("--dump-html", action="store_true", help="In body HTML (kem --dry-run)")
    parser.add_argument("--to", action="append", default=[], help="Nguoi nhan (lap lai duoc); ghi de settings")
    parser.add_argument("--cc", action="append", default=[], help="Cc (lap lai duoc); ghi de settings")
    parser.add_argument("--week", default=None, metavar="YYYY-MM-DD",
                        help="Bao cao tuan bat dau ngay nay (mac dinh: tuan cua sprint hien tai)")
    args = parser.parse_args()

    week = None
    if args.week:
        try:
            week = datetime.strptime(args.week, "%Y-%m-%d").date()
        except ValueError:
            print(f"LOI: --week '{args.week}' sai định dạng, cần YYYY-MM-DD")
            sys.exit(1)

    try:
        # Gui mail thay mat admin -> admin only. --dry-run chi doc.
        if not args.dry_run:
            permissions.require_admin(repo.db(), "gửi mail weekly report")
        if args.dump_html and args.dry_run:
            mail = build_mail(args.project, week)
            print(mail["html"])
            return
        for line in run(args.project, args.dry_run, args.to, args.cc, week):
            print(line)
    except (PermissionDenied, ResolveError, gmail.GmailError, wr.sg.SheetsError) as e:
        print(f"LOI: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
