// All shared domain types. Mirrors DATA_MODEL.md — keep field names in sync
// with Firestore and bot/skills/constants.py.

import type { Timestamp } from './lib/time';

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type SprintStatus = 'planning' | 'active' | 'completed';
export type UserRole = 'admin' | 'member'; // permission level (NOT job discipline)
export type TaskSource = 'web' | 'discord';

/** Job discipline — separate from the admin/member permission role. */
export type JobRole =
  | 'developer'
  | '2d_artist'
  | 'game_designer'
  | 'sound_designer'
  | 'ui_artist'
  | 'animator';

export const JOB_ROLES: { id: JobRole; label: string; icon: string }[] = [
  { id: 'developer', label: 'Developer', icon: '💻' },
  { id: '2d_artist', label: '2D Artist', icon: '🎨' },
  { id: 'game_designer', label: 'Game Designer', icon: '🎮' },
  { id: 'sound_designer', label: 'Sound Designer', icon: '🎵' },
  { id: 'ui_artist', label: 'UI Artist', icon: '🖌️' },
  { id: 'animator', label: 'Animator', icon: '🎞️' },
];

export const JOB_ROLE_LABEL: Record<JobRole, string> = JOB_ROLES.reduce(
  (acc, r) => ({ ...acc, [r.id]: r.label }),
  {} as Record<JobRole, string>,
);

export const JOB_ROLE_ICON: Record<JobRole, string> = JOB_ROLES.reduce(
  (acc, r) => ({ ...acc, [r.id]: r.icon }),
  {} as Record<JobRole, string>,
);

export type ActivityType = 'created' | 'status_change' | 'comment' | 'updated';

/** One entry in a task's activity feed (auto events + comments). */
export interface Activity {
  id: string;
  taskId: string;
  actorId: string | null;
  actorName: string;
  type: ActivityType;
  body: string;
  createdAt?: Timestamp;
}

/** An in-app notification delivered to one user (the web half of completion notices). */
export interface AppNotification {
  id: string;
  recipientId: string;
  taskId: string;
  taskTitle: string;
  type: 'task_done';
  body: string;
  actorName: string;
  read: boolean;
  createdAt?: Timestamp;
}

/** Admin-managed sign-in allowlist. Empty (both arrays) = allow anyone (bootstrap). */
export interface AccessConfig {
  emails: string[];
  domains: string[];
}

export type AttachmentKind = 'image' | 'video' | 'file' | 'link';

/** An image (uploaded or by URL) or an embedded external link on a task. */
export interface Attachment {
  id: string;
  kind: AttachmentKind;
  url: string;
  name: string;
  /** drive | discord | notion | figma | github | image | link — drives the card icon. */
  provider: string;
  /** Storage path for uploaded images (kept so we can delete the file later). */
  storagePath?: string;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];
export const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Cần làm',
  in_progress: 'Đang làm',
  review: 'Review',
  done: 'Hoàn thành',
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  urgent: 'Gấp',
};

export interface TeamMember {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: UserRole;
  jobRole?: JobRole;
  discordId?: string;
  notionUserId?: string;
  createdAt?: Timestamp;
  lastSeenAt?: Timestamp;
}

/** A feature: a unit of product work inside a project. Tasks may attach to one. */
export interface Feature {
  id: string;
  projectId: string;
  name: string;
  icon: string; // emoji shown on the card
  color: string; // accent hex
  description: string;
  createdAt?: Timestamp;
  createdBy: string;
}

/** A project (created in-app) optionally linked to a Notion project page. */
export interface Project {
  id: string;
  name: string;
  icon: string; // emoji shown on the card
  color: string; // accent token/hex for the card
  description: string;
  /** Notion Projects DB page id — lets task syncs set the Notion "Project" relation. */
  notionProjectId: string | null;
  createdAt?: Timestamp;
  createdBy: string;
}

export type BugStatus = 'open' | 'fixing' | 'pending' | 'deployed' | 'done';

export const BUG_STATUSES: BugStatus[] = ['open', 'fixing', 'pending', 'deployed', 'done'];

export const BUG_STATUS_LABEL: Record<BugStatus, string> = {
  open: 'Mở',
  fixing: 'Đang sửa',
  pending: 'Chờ',
  deployed: 'Đã deploy',
  done: 'Xong',
};

/** A project-scoped label in the bug tag palette (Bug / High / Fixing / 1.0.x / …). */
export interface BugLabel {
  id: string;
  projectId: string;
  name: string;
  color: string;
  icon: string; // optional emoji
  /** Linked Discord forum tag id (for two-way sync); null = app-only label. */
  discordTagId: string | null;
  createdAt?: Timestamp;
  createdBy: string;
}

/** A bug report inside a project. `number` is a per-project running id (#530). */
export interface Bug {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: string;
  status: BugStatus;
  labelIds: string[];
  reporterId: string | null;
  reporterName: string;
  assigneeId: string | null;
  assigneeName: string;
  order: number;
  /** Images/videos/files pulled from the Discord post (mirrored to Storage). */
  attachments: Attachment[];
  /** Source Discord forum thread id (null = created in-app). */
  discordThreadId: string | null;
  /** Guild the thread lives in — with the thread id, builds the Discord deep link. */
  discordGuildId: string | null;
  /** True when app-side label edits still need pushing to the Discord thread. */
  pendingDiscordPush?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Sprint {
  id: string;
  name: string;
  goal: string;
  status: SprintStatus;
  startDate: Timestamp | null;
  endDate: Timestamp | null;
  createdAt?: Timestamp;
  createdBy: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  sprintId: string | null;
  projectId: string | null;
  featureId: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  assigneeName: string;
  reporterId: string;
  points: number;
  tags: string[];
  /** Work window start (set to creation day). End is `dueDate`. */
  dueStart: Timestamp | null;
  /** Work window end / deadline. On completion it is reset to the actual done day. */
  dueDate: Timestamp | null;
  order: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  source: TaskSource;
  notionPageId?: string | null;
  notionUrl?: string | null;
  attachments: Attachment[];
  subtasks: Subtask[];
  /** Related people (uids) beyond the assignee — mentioned on completion. */
  watcherIds: string[];
  watcherNames: string[];
}

/** Payload used when creating a task from the UI (server fills timestamps/id). */
export type NewTaskInput = Pick<
  Task,
  'title' | 'description' | 'sprintId' | 'projectId' | 'featureId' | 'status' | 'priority' | 'points'
> & {
  assigneeId: string | null;
  dueDate: Date | null;
  attachments: Attachment[];
  subtasks: Subtask[];
  watcherIds: string[];
};
