// Row mappers: Postgres (snake_case, ISO timestamps) ↔ app types (camelCase, Timestamp).
// Kept in one place so hooks/writes stay declarative and the naming boundary is explicit.

import { Timestamp } from './time';
import type { TaskReport } from './performance';
import type {
  Activity,
  AppNotification,
  Attachment,
  Bug,
  BugLabel,
  Feature,
  FeatureLabel,
  Project,
  Sprint,
  Subtask,
  Task,
  TeamMember,
} from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export function rowToMember(r: Row): TeamMember {
  return {
    uid: r.id,
    email: r.email ?? '',
    displayName: r.display_name ?? '',
    photoURL: r.photo_url ?? '',
    role: r.role,
    jobRole: r.job_role ?? undefined,
    discordId: r.discord_id ?? undefined,
    notionUserId: r.notion_user_id ?? undefined,
    createdAt: Timestamp.fromISO(r.created_at) ?? undefined,
    lastSeenAt: Timestamp.fromISO(r.last_seen_at) ?? undefined,
  };
}

export function rowToSprint(r: Row): Sprint {
  return {
    id: r.id,
    name: r.name,
    goal: r.goal ?? '',
    status: r.status,
    startDate: Timestamp.fromISO(r.start_date),
    endDate: Timestamp.fromISO(r.end_date),
    createdAt: Timestamp.fromISO(r.created_at) ?? undefined,
    createdBy: r.created_by ?? '',
  };
}

export function rowToProject(r: Row): Project {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon ?? '📁',
    color: r.color ?? '#6366f1',
    description: r.description ?? '',
    notionProjectId: r.notion_project_id ?? null,
    weeklySheetId: r.weekly_sheet_id ?? null,
    createdAt: Timestamp.fromISO(r.created_at) ?? undefined,
    createdBy: r.created_by ?? '',
  };
}

export function rowToFeature(r: Row): Feature {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    icon: r.icon ?? '🧩',
    color: r.color ?? '#6366f1',
    description: r.description ?? '',
    // ?? để chịu được lúc migration 0026 chưa áp — cột thiếu thì coi như mặc định.
    kind: r.kind ?? 'delivery',
    labelIds: r.label_ids ?? [],
    attachments: (r.attachments ?? []) as Attachment[],
    doneAt: Timestamp.fromISO(r.done_at),
    createdAt: Timestamp.fromISO(r.created_at) ?? undefined,
    createdBy: r.created_by ?? '',
  };
}

export function rowToFeatureLabel(r: Row): FeatureLabel {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    color: r.color ?? '#6366f1',
    icon: r.icon ?? '',
    createdAt: Timestamp.fromISO(r.created_at) ?? undefined,
    createdBy: r.created_by ?? '',
  };
}

export function rowToBugLabel(r: Row): BugLabel {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    color: r.color ?? '#6366f1',
    icon: r.icon ?? '',
    discordTagId: r.discord_tag_id ?? null,
    createdAt: Timestamp.fromISO(r.created_at) ?? undefined,
    createdBy: r.created_by ?? '',
  };
}

/**
 * Cột cho DANH SÁCH bug — cố ý bỏ `description` + `attachments`: ruột chiếm ~250 kB
 * cho 640 bug mà kanban/list không hiển thị. Ruột nạp riêng khi mở BugModal
 * (`fetchBugDetail` trong bugWrites). rowToBug điền '' / [] cho phần thiếu.
 */
export const BUG_SUMMARY_COLUMNS =
  'id, project_id, number, title, status, label_ids, reporter_id, reporter_name, ' +
  'assignee_id, assignee_name, order, discord_thread_id, discord_guild_id, ' +
  'pending_discord_push, created_at, updated_at, done_at';

export function rowToBug(r: Row): Bug {
  return {
    id: r.id,
    projectId: r.project_id,
    number: r.number ?? 0,
    title: r.title,
    description: r.description ?? '',
    status: r.status,
    labelIds: r.label_ids ?? [],
    reporterId: r.reporter_id ?? null,
    reporterName: r.reporter_name ?? '',
    assigneeId: r.assignee_id ?? null,
    assigneeName: r.assignee_name ?? '',
    order: r.order ?? 0,
    attachments: (r.attachments ?? []) as Attachment[],
    discordThreadId: r.discord_thread_id ?? null,
    discordGuildId: r.discord_guild_id ?? null,
    pendingDiscordPush: Boolean(r.pending_discord_push),
    createdAt: Timestamp.fromISO(r.created_at) ?? undefined,
    updatedAt: Timestamp.fromISO(r.updated_at) ?? undefined,
    doneAt: Timestamp.fromISO(r.done_at) ?? undefined,
  };
}

/** Convert a partial Bug patch (camelCase) to a DB row patch (snake_case). */
export function bugPatchToRow(patch: Partial<Bug>): Row {
  const map: Record<string, string> = {
    title: 'title',
    description: 'description',
    status: 'status',
    labelIds: 'label_ids',
    assigneeId: 'assignee_id',
    assigneeName: 'assignee_name',
    reporterId: 'reporter_id',
    reporterName: 'reporter_name',
    order: 'order',
    pendingDiscordPush: 'pending_discord_push',
  };
  const row: Row = {};
  for (const [k, v] of Object.entries(patch)) if (map[k]) row[map[k]] = v;
  return row;
}

export function rowToTask(r: Row): Task {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    sprintId: r.sprint_id ?? null,
    projectId: r.project_id ?? null,
    featureId: r.feature_id ?? null,
    status: r.status,
    priority: r.priority,
    assigneeId: r.assignee_id ?? null,
    assigneeName: r.assignee_name ?? '',
    reporterId: r.reporter_id ?? '',
    points: r.points ?? 0,
    tags: r.tags ?? [],
    dueStart: Timestamp.fromISO(r.due_start),
    dueDate: Timestamp.fromISO(r.due_date),
    order: r.order ?? 0,
    createdAt: Timestamp.fromISO(r.created_at) ?? undefined,
    updatedAt: Timestamp.fromISO(r.updated_at) ?? undefined,
    source: r.source,
    notionPageId: r.notion_page_id ?? null,
    notionUrl: r.notion_url ?? null,
    attachments: (r.attachments ?? []) as Attachment[],
    subtasks: (r.subtasks ?? []) as Subtask[],
    watcherIds: r.watcher_ids ?? [],
    watcherNames: r.watcher_names ?? [],
  };
}

export function rowToNotification(r: Row): AppNotification {
  return {
    id: r.id,
    recipientId: r.recipient_id,
    taskId: r.task_id ?? '',
    taskTitle: r.task_title ?? '',
    type: r.type,
    body: r.body ?? '',
    actorName: r.actor_name ?? '',
    read: Boolean(r.read),
    createdAt: Timestamp.fromISO(r.created_at) ?? undefined,
  };
}

export function rowToActivity(r: Row): Activity {
  return {
    id: r.id,
    taskId: r.task_id,
    actorId: r.actor_id ?? null,
    actorName: r.actor_name ?? '',
    type: r.type,
    body: r.body ?? '',
    createdAt: Timestamp.fromISO(r.created_at) ?? undefined,
    editedAt: Timestamp.fromISO(r.edited_at) ?? undefined,
  };
}

/** Một dòng từ RPC `task_report` (xem migration 0016). */
export function rowToTaskReport(r: Row): TaskReport {
  return {
    taskId: r.task_id,
    sprintIds: r.sprint_ids ?? [],
    firstInProgressAt: Timestamp.fromISO(r.first_in_progress_at),
    firstDoneAt: Timestamp.fromISO(r.first_done_at),
  };
}

/** Convert a partial Task patch (camelCase, Timestamp) to a DB row patch (snake_case, ISO). */
export function taskPatchToRow(patch: Partial<Task>): Row {
  const map: Record<string, string> = {
    title: 'title',
    description: 'description',
    sprintId: 'sprint_id',
    projectId: 'project_id',
    featureId: 'feature_id',
    status: 'status',
    priority: 'priority',
    assigneeId: 'assignee_id',
    assigneeName: 'assignee_name',
    reporterId: 'reporter_id',
    points: 'points',
    tags: 'tags',
    order: 'order',
    source: 'source',
    notionPageId: 'notion_page_id',
    notionUrl: 'notion_url',
    attachments: 'attachments',
    subtasks: 'subtasks',
    watcherIds: 'watcher_ids',
    watcherNames: 'watcher_names',
  };
  const row: Row = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'dueStart') row.due_start = v ? (v as Timestamp).toISOString() : null;
    else if (k === 'dueDate') row.due_date = v ? (v as Timestamp).toISOString() : null;
    else if (map[k]) row[map[k]] = v;
  }
  return row;
}
