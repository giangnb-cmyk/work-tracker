"""Skill CLI: dien weekly report cua 1 project vao Google Sheet cua chinh project do.

Doc task tu Supabase -> ghi 2 o trong tab 'Discussion':
  - "Tiến độ / Hiện tại"        <- task DA XONG cua sprint TRUOC   ("đã hoàn thành tuần trước")
  - "Tiến độ / Tiếp theo làm gì" <- task CHUA XONG cua sprint HIEN TAI ("kế hoạch tuần tới")

CAU TRUC SHEET (khao sat tu file that "M1 - Weekly Report"): la MA TRAN, khong phai danh
sach. Cot A = nen tang, B = hang muc, C = cau hoi, con MOI TUAN LA MOT COT (D, E, ... AX).
Hang 1 = ngay bat dau tuan (dd/mm/yyyy), hang 2 = ngay ket thuc.

CO Y do hang theo NHAN (cot B/C) chu khong hardcode "hang 3/hang 6": ai them mot hang vao
giua la toa do cung sai het, ma sai o day nghia la ghi de nham noi dung nguoi khac viet.

Sheet id lay tu `projects.weekly_sheet_id` (migration 0022) -> moi project mot sheet rieng,
admin sua ngay tren web, khong phai dung vao may chay bot.

AN TOAN — o nay nguoi that dang viet tay:
  - KHONG BAO GIO ghi noi dung rong de len o dang co chu.
  - Cot tuan da co noi dung thi BO QUA, tru khi --force.
  - --dry-run de xem truoc, khong ghi gi.

Vi du (chay trong thu muc bot/):
    python skills/weekly_report.py --dry-run
    python skills/weekly_report.py --project "M1 - Tasty Merge"
    python skills/weekly_report.py --force
"""

import argparse
import sys
from datetime import date, datetime, timedelta

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import permissions
import project_repo as prepo
import sheets_gateway as sg
import task_repo as repo
from constants import STATUS_DONE, _fold
from errors import PermissionDenied, ResolveError

TAB = "Discussion"
_HEAD_ROWS = "A1:BZ2"
_LABEL_RANGE = "B1:C60"

# Nhan trong sheet (so sanh qua _fold -> bo dau, thuong hoa) .
_BLOCK_PROGRESS = _fold("Tiến độ")
_Q_CURRENT = _fold("Hiện tại")
_Q_NEXT = _fold("Tiếp theo làm gì")

_DATE_FMT = "%d/%m/%Y"


def die(message: str):
    print(f"LOI: {message}")
    sys.exit(1)


# --- Doc du lieu -------------------------------------------------------------

def _start_date(sprint) -> date | None:
    raw = sprint.get("startDate")
    return repo._as_datetime(raw).date() if raw else None


def sprint_pair(client):
    """(sprint truoc, sprint hien tai) theo THU TU NGAY BAT DAU.

    Sap theo startDate chu khong theo created_at nhu list_sprints: sprint tao sau van co
    the la sprint cua tuan truoc. Sprint thieu ngay bi day xuong cuoi (khong doan).
    """
    sprints = repo.list_sprints(client)
    dated = [s for s in sprints if _start_date(s)]
    dated.sort(key=_start_date)
    if not dated:
        return None, None

    active = next((s for s in dated if s.get("status") == "active"), None)
    current = active or dated[-1]
    idx = dated.index(current)
    previous = dated[idx - 1] if idx > 0 else None
    return previous, current


def bullets(tasks) -> str:
    """Task -> cac dong '- tieu de', khop dinh dang nguoi that dang go trong sheet."""
    lines = []
    for t in tasks:
        title = (t.get("title") or "").strip()
        if title:
            lines.append(f"- {title}")
    return "\n".join(lines)


def build_sections(client, previous, current) -> tuple[str, str]:
    """(da hoan thanh tuan truoc, ke hoach tuan toi)."""
    done_text = ""
    if previous:
        done = [t for t in repo.query_tasks(client, sprint_id=previous["_id"])
                if t.get("status") == STATUS_DONE]
        done_text = bullets(done)

    plan_text = ""
    if current:
        # Ke hoach = viec CON LAI. Task da xong roi thi khong con la ke hoach nua.
        plan = [t for t in repo.query_tasks(client, sprint_id=current["_id"])
                if t.get("status") != STATUS_DONE]
        plan_text = bullets(plan)
    return done_text, plan_text


# --- Dinh vi trong sheet -----------------------------------------------------

def locate_rows(sess, sheet_id: str, tab: str) -> dict:
    """{(khoi, cau hoi) -> so hang 1-based}, doc tu cot B/C.

    Cot B la o GOP (chi hang dau moi co chu) nen phai keo gia tri khoi xuong cac hang sau.
    """
    grid = sg.get_values(sess, sheet_id, f"{tab}!{_LABEL_RANGE}")
    found, block = {}, ""
    for i, row in enumerate(grid, start=1):
        b = (row[0] if len(row) > 0 else "").strip()
        c = (row[1] if len(row) > 1 else "").strip()
        if b:
            block = b
        if c:
            found[(_fold(block), _fold(c))] = i
    return found


def find_week_col(sess, sheet_id: str, tab: str, start: date) -> tuple[int, bool]:
    """(chi so cot 0-based, da ton tai chua) cho tuan bat dau `start`."""
    head = sg.get_values(sess, sheet_id, f"{tab}!{_HEAD_ROWS}")
    starts = head[0] if head else []
    want = start.strftime(_DATE_FMT)
    for i, value in enumerate(starts):
        if value.strip() == want:
            return i, True
    # Chua co -> them ngay sau cot tuan cuoi cung. Toi thieu la cot D (index 3).
    last = max((i for i, v in enumerate(starts) if v.strip()), default=2)
    return max(last + 1, 3), False


# --- Ghi ---------------------------------------------------------------------

def _write_cell(sess, sheet_id, tab, col0, row, text) -> bool:
    a1 = f"{tab}!{sg.col_name(col0)}{row}"
    sg.update_values(sess, sheet_id, a1, [[text]])
    return True


def _target_week(current, week_override: date | None) -> tuple[date, date | None]:
    """(ngay bat dau, ngay ket thuc) cua cot se ghi. Mac dinh = tuan cua sprint hien tai."""
    if week_override:
        return week_override, week_override + timedelta(days=6)
    start = _start_date(current)
    end = repo._as_datetime(current["endDate"]).date() if current.get("endDate") else None
    return start, end


def write_report(sess, sheet_id, tab, current, done_text, plan_text, force=False,
                 week: date | None = None) -> list[str]:
    """Ghi vao cot cua tuan `current` (hoac `week` neu chi dinh). Tra ve log de in."""
    rows = locate_rows(sess, sheet_id, tab)
    row_done = rows.get((_BLOCK_PROGRESS, _Q_CURRENT))
    row_plan = rows.get((_BLOCK_PROGRESS, _Q_NEXT))
    if not row_done or not row_plan:
        raise sg.SheetsError(
            f"không thấy hàng 'Tiến độ / Hiện tại' hoặc 'Tiến độ / Tiếp theo làm gì' trong "
            f"tab '{tab}'. Sheet đã đổi khung? (đọc nhãn ở cột B/C)"
        )

    start, end = _target_week(current, week)
    col0, existed = find_week_col(sess, sheet_id, tab, start)
    col = sg.col_name(col0)
    log = [f"Cột tuần: {col} ({start.strftime(_DATE_FMT)}"
           f"{' → ' + end.strftime(_DATE_FMT) if end else ''}) — "
           f"{'đã có sẵn' if existed else 'tạo mới'}"]

    # Grid co bien that: tab dung dung toi cot tuan cuoi, nen cot tuan MOI nam ngoai grid
    # va Sheets tra '400 exceeds grid limits' chu khong tu gian. Noi rong truoc khi ghi.
    added = sg.ensure_columns(sess, sheet_id, tab, col0)
    if added:
        log.append(f"- Đã nới grid thêm {added} cột (tab vừa hết chỗ)")

    if not existed and end:
        sg.update_values(sess, sheet_id, f"{tab}!{col}1:{col}2",
                         [[start.strftime(_DATE_FMT)], [end.strftime(_DATE_FMT)]])
        log.append(f"- Đã ghi ngày tuần vào {col}1:{col}2")

    current_cells = sg.get_values(sess, sheet_id, f"{tab}!{col}{row_done}:{col}{row_plan}")

    def _existing(row: int) -> str:
        i = row - row_done
        if 0 <= i < len(current_cells) and current_cells[i]:
            return (current_cells[i][0] or "").strip()
        return ""

    for row, text, label in ((row_done, done_text, "Đã hoàn thành tuần trước"),
                             (row_plan, plan_text, "Kế hoạch tuần tới")):
        old = _existing(row)
        if not text.strip():
            log.append(f"- BỎ QUA {label} ({col}{row}): không có task nào để ghi"
                       f"{' — giữ nguyên nội dung đang có' if old else ''}")
            continue
        if old and not force:
            log.append(f"- BỎ QUA {label} ({col}{row}): ô đã có nội dung (người viết tay?). "
                       f"Dùng --force nếu muốn ghi đè.")
            continue
        _write_cell(sess, sheet_id, tab, col0, row, text)
        log.append(f"- Đã ghi {label} vào {col}{row} ({len(text.splitlines())} dòng)")
    return log


# --- Entry -------------------------------------------------------------------

def run(project_token: str | None, tab: str, dry_run: bool, force: bool,
        week: date | None = None) -> list[str]:
    """Duong chay dung chung cho CLI va lich tu dong trong bot.py."""
    client = repo.db()
    project = (prepo.resolve_project(client, project_token) if project_token
               else _only_project(client))
    sheet_id = (project.get("weeklySheetId") or "").strip()
    if not sheet_id:
        raise sg.SheetsError(
            f"project '{project.get('name')}' chưa có link sheet weekly report. "
            f"Vào web > Dự án > sửa project > dán link Google Sheet."
        )

    previous, current = sprint_pair(client)
    if not current:
        raise sg.SheetsError("chưa có sprint nào có ngày bắt đầu — không biết ghi vào tuần nào.")

    done_text, plan_text = build_sections(client, previous, current)
    head = [
        f"Project: {project.get('name')} · sheet {sheet_id[:12]}…",
        f"Sprint trước: {previous.get('name') if previous else '(không có)'} → "
        f"{len(done_text.splitlines())} task đã xong",
        f"Sprint hiện tại: {current.get('name')} → {len(plan_text.splitlines())} task còn lại",
    ]
    if dry_run:
        return head + ["", "--- Đã hoàn thành tuần trước ---", done_text or "(trống)",
                       "", "--- Kế hoạch tuần tới ---", plan_text or "(trống)",
                       "", "(--dry-run: chưa ghi gì lên sheet)"]

    sess = sg.session()
    return head + write_report(sess, sheet_id, tab, current, done_text, plan_text, force, week)


def run_all(tab: str = TAB, force: bool = False) -> list[str]:
    """Chay cho MOI project da cau hinh sheet — duong ma lich sang thu 2 (bot.py) dung.

    Project chua dien sheet thi bo qua im lang (chua bat tinh nang, khong phai loi).
    Mot project loi KHONG duoc lam chet ca luot: ghi log roi di tiep.
    """
    client = repo.db()
    out = []
    for project in prepo.list_projects(client):
        if not (project.get("weeklySheetId") or "").strip():
            continue
        try:
            out += run(project["_id"], tab, dry_run=False, force=force)
        except (sg.SheetsError, ResolveError) as e:
            out.append(f"LOI [{project.get('name')}]: {e}")
        out.append("")
    return out or ["Chưa project nào cấu hình sheet weekly report."]


def _only_project(client):
    """Khong truyen --project ma he thong chi co dung 1 project -> lay luon cai do."""
    projects = prepo.list_projects(client)
    if len(projects) == 1:
        return projects[0]
    names = ", ".join(p.get("name", "?") for p in projects)
    raise sg.SheetsError(f"có nhiều project, cần --project. Đang có: {names}")


def main():
    parser = argparse.ArgumentParser(description="Dien weekly report vao Google Sheet.")
    parser.add_argument("--project", default=None, help="Ten hoac id project (bo qua neu chi co 1)")
    parser.add_argument("--tab", default=TAB, help=f"Ten tab trong sheet (mac dinh '{TAB}')")
    parser.add_argument("--dry-run", action="store_true", help="Chi in ra, khong ghi")
    parser.add_argument("--force", action="store_true", help="Ghi de ca o da co noi dung")
    parser.add_argument("--week", default=None, metavar="YYYY-MM-DD",
                        help="Ghi vao cot cua tuan bat dau ngay nay (mac dinh: tuan cua sprint hien tai)")
    args = parser.parse_args()

    week = None
    if args.week:
        try:
            week = datetime.strptime(args.week, "%Y-%m-%d").date()
        except ValueError:
            die(f"--week '{args.week}' sai định dạng, cần YYYY-MM-DD")

    try:
        # Ghi vao sheet cua ca doi -> admin. --dry-run chi doc nen khong can quyen.
        if not args.dry_run:
            permissions.require_admin(repo.db(), "điền weekly report vào sheet")
        for line in run(args.project, args.tab, args.dry_run, args.force, week):
            print(line)
    except (PermissionDenied, ResolveError, sg.SheetsError) as e:
        die(str(e))


if __name__ == "__main__":
    main()
