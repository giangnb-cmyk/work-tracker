"""Skill CLI: in bao cao tien do 1 sprint (dung cho tinh nang 'bao cao sprint').

Dem theo trang thai, chia theo nguoi, story points done/tong, % hoan thanh,
so ngay con lai den endDate, va danh sach task tre han. Bullet Discord, KHONG bang.

Vi du:
    python sprint_report.py                 # sprint active
    python sprint_report.py --sprint "Sprint 12"
"""

import argparse
import sys
from datetime import datetime, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import task_repo as repo
from constants import STATUS_DONE, STATUS_ORDER


def die(message: str):
    print(f"LOI: {message}")
    sys.exit(1)


def _count_by_status(tasks) -> dict:
    """Dem so task theo tung trang thai (giu thu tu cot Kanban)."""
    counts = {s: 0 for s in STATUS_ORDER}
    for t in tasks:
        status = t.get("status", "")
        counts[status] = counts.get(status, 0) + 1
    return counts


def _by_assignee(tasks) -> dict:
    """Gom {ten: {'total': n, 'done': n, 'points': p, 'points_done': p}}."""
    groups = {}
    for t in tasks:
        name = t.get("assigneeName") or "Chua giao"
        g = groups.setdefault(name, {"total": 0, "done": 0, "points": 0, "points_done": 0})
        g["total"] += 1
        pts = t.get("points", 0) or 0
        g["points"] += pts
        if t.get("status") == STATUS_DONE:
            g["done"] += 1
            g["points_done"] += pts
    return groups


def _overdue(tasks, now: datetime):
    """Task chua done va co dueDate < bay gio."""
    result = []
    for t in tasks:
        if t.get("status") == STATUS_DONE:
            continue
        due = t.get("dueDate")
        if due and repo._as_datetime(due) < now:
            result.append(t)
    return result


def _days_remaining(sprint, now: datetime):
    """So ngay den endDate (am neu da qua). None neu sprint khong co endDate."""
    end = sprint.get("endDate")
    if not end:
        return None
    return (repo._as_datetime(end).date() - now.date()).days


def _format_report(sprint, tasks, now: datetime) -> str:
    """Ghep bao cao thanh chuoi bullet Discord (khong dung bang markdown)."""
    total = len(tasks)
    counts = _count_by_status(tasks)
    done = counts.get(STATUS_DONE, 0)
    pct = round(done / total * 100) if total else 0
    pts_total = sum(t.get("points", 0) or 0 for t in tasks)
    pts_done = sum(t.get("points", 0) or 0 for t in tasks if t.get("status") == STATUS_DONE)

    lines = [f"Bao cao sprint: {sprint.get('name', '(khong ten)')}"]
    goal = sprint.get("goal")
    if goal:
        lines.append(f"Muc tieu: {goal}")

    days = _days_remaining(sprint, now)
    if days is not None:
        when = f"con {days} ngay" if days >= 0 else f"da qua han {abs(days)} ngay"
        lines.append(f"Thoi gian: {when} den ket thuc.")

    lines.append(f"Tien do: {done}/{total} task done ({pct}%).")
    lines.append(f"Story points: {pts_done}/{pts_total} done.")

    lines.append("Theo trang thai:")
    for status in STATUS_ORDER:
        lines.append(f"- {status}: {counts.get(status, 0)}")

    lines.append("Theo nguoi:")
    for name, g in sorted(_by_assignee(tasks).items(), key=lambda kv: -kv[1]["total"]):
        lines.append(
            f"- {name}: {g['done']}/{g['total']} done, {g['points_done']}/{g['points']} pts"
        )

    overdue = _overdue(tasks, now)
    if overdue:
        lines.append(f"Tre han ({len(overdue)}):")
        for t in overdue:
            who = t.get("assigneeName") or "chua giao"
            lines.append(f"- [{repo.short_id(t['_id'])}] {t.get('title', '')} ({who})")
    else:
        lines.append("Khong co task nao tre han. 👍")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Bao cao tien do sprint (Discord bot skill).")
    parser.add_argument("--sprint", default="active", help="Ten sprint | 'active' (mac dinh)")
    args = parser.parse_args()

    now = datetime.now(timezone.utc)
    try:
        client = repo.db()
        sprint = repo.resolve_sprint(client, args.sprint)
        tasks = repo.query_tasks(client, sprint_id=sprint["_id"])
    except repo.ResolveError as e:
        die(str(e))
    except Exception as e:
        die(f"loi khong mong doi: {e}")

    if not tasks:
        print(f"Sprint '{sprint.get('name')}' chua co task nao.")
        return
    print(_format_report(sprint, tasks, now))


if __name__ == "__main__":
    main()
