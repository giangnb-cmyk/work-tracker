"""One-off data migration: Firestore -> Supabase (Postgres).

Run ONCE, then verify. Idempotency is best-effort (re-running may duplicate rows for
sprints/projects/tasks — prefer a clean target). Profiles are keyed by a NEW Supabase
auth user per email so that a later Google sign-in (same verified email) links to the
same uid and inherits the migrated data.

Prerequisites (install into a throwaway venv — NOT the bot runtime):
    pip install firebase-admin supabase

Env:
    FIREBASE_SERVICE_ACCOUNT_KEY=/path/to/serviceAccountKey.json   # old Firestore
    SUPABASE_URL=https://<ref>.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=<service_role secret>

Usage:
    python supabase/migrate_from_firestore.py            # migrate everything
    python supabase/migrate_from_firestore.py --dry-run  # read + report, no writes
"""

import argparse
import os
import sys
from datetime import datetime

import firebase_admin
from firebase_admin import credentials, firestore
from supabase import create_client


def iso(v):
    """Firestore Timestamp/datetime -> ISO string, else None."""
    if not v:
        return None
    if isinstance(v, datetime):
        return v.isoformat()
    if hasattr(v, "ToDatetime"):
        return v.ToDatetime().isoformat()
    return str(v)


def connect():
    key = os.environ["FIREBASE_SERVICE_ACCOUNT_KEY"]
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(key))
    fs = firestore.client()
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    return fs, sb


def migrate_profiles(fs, sb, dry):
    """Create a Supabase auth user per Firestore user; return {oldUid: newUid}."""
    id_map = {}
    for doc in fs.collection("users").stream():
        u = doc.to_dict()
        email = (u.get("email") or "").strip().lower()
        if not email:
            print(f"  skip user {doc.id}: no email")
            continue
        if dry:
            print(f"  would create auth user {email}")
            continue
        # Create the auth user (trigger inserts a profiles row); tolerate 'already exists'.
        try:
            res = sb.auth.admin.create_user(
                {
                    "email": email,
                    "email_confirm": True,
                    "user_metadata": {
                        "full_name": u.get("displayName", ""),
                        "avatar_url": u.get("photoURL", ""),
                    },
                }
            )
            new_uid = res.user.id
        except Exception as e:
            # Likely already created on a prior run — look it up.
            found = next(
                (x for x in sb.auth.admin.list_users() if (x.email or "").lower() == email), None
            )
            if not found:
                print(f"  ERROR creating {email}: {e}")
                continue
            new_uid = found.id
        # Overlay app fields onto the auto-created profile row.
        sb.table("profiles").update(
            {
                "role": u.get("role", "member"),
                "job_role": u.get("jobRole"),
                "discord_id": u.get("discordId"),
                "notion_user_id": u.get("notionUserId"),
                "display_name": u.get("displayName", ""),
                "photo_url": u.get("photoURL", ""),
            }
        ).eq("id", new_uid).execute()
        id_map[doc.id] = new_uid
        print(f"  profile {email} -> {new_uid}")
    return id_map


def migrate_collection(fs, sb, name, table, transform, dry):
    """Generic: read a Firestore collection, transform each doc, insert; return {oldId: newId}."""
    id_map = {}
    for doc in fs.collection(name).stream():
        row = transform({**doc.to_dict(), "_id": doc.id})
        if row is None:
            continue
        if dry:
            print(f"  would insert {table}: {row.get('name') or row.get('title') or doc.id}")
            continue
        res = sb.table(table).insert(row).execute()
        id_map[doc.id] = res.data[0]["id"]
    return id_map


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    dry = args.dry_run
    fs, sb = connect()

    print("1) profiles (auth users)…")
    users = migrate_profiles(fs, sb, dry)

    print("2) sprints…")
    sprints = migrate_collection(
        fs, sb, "sprints", "sprints",
        lambda s: {
            "name": s.get("name", ""),
            "goal": s.get("goal", ""),
            "status": s.get("status", "planning"),
            "start_date": iso(s.get("startDate")),
            "end_date": iso(s.get("endDate")),
            "created_by": users.get(s.get("createdBy")),
        },
        dry,
    )

    print("3) projects…")
    projects = migrate_collection(
        fs, sb, "projects", "projects",
        lambda p: {
            "name": p.get("name", ""),
            "icon": p.get("icon", "📁"),
            "color": p.get("color", "#6366f1"),
            "description": p.get("description", ""),
            "notion_project_id": p.get("notionProjectId"),
            "created_by": users.get(p.get("createdBy")),
        },
        dry,
    )

    print("4) tasks…")
    def task_row(t):
        return {
            "title": t.get("title", "")[:140] or "(untitled)",
            "description": t.get("description", ""),
            "sprint_id": sprints.get(t.get("sprintId")),
            "project_id": projects.get(t.get("projectId")),
            "status": t.get("status", "todo"),
            "priority": t.get("priority", "medium"),
            "assignee_id": users.get(t.get("assigneeId")),
            "assignee_name": t.get("assigneeName", ""),
            "reporter_id": users.get(t.get("reporterId")),
            "points": t.get("points", 0),
            "tags": t.get("tags", []),
            "due_start": iso(t.get("dueStart")),
            "due_date": iso(t.get("dueDate")),
            "order": t.get("order", 0),
            "source": t.get("source", "web"),
            "notion_page_id": t.get("notionPageId"),
            "notion_url": t.get("notionUrl"),
            "attachments": t.get("attachments", []),
            "subtasks": t.get("subtasks", []),
            "watcher_ids": [users[w] for w in (t.get("watcherIds") or []) if w in users],
            "watcher_names": t.get("watcherNames", []),
        }
    migrate_collection(fs, sb, "tasks", "tasks", task_row, dry)

    print("5) config/access…")
    acc = fs.collection("config").document("access").get()
    if acc.exists and not dry:
        a = acc.to_dict()
        sb.table("app_config").upsert(
            {"id": "access", "emails": a.get("emails", []), "domains": a.get("domains", [])},
            on_conflict="id",
        ).execute()

    print("\nDone." if not dry else "\nDry run complete.")
    print(f"Users migrated: {len(users)}")


if __name__ == "__main__":
    sys.exit(main())
