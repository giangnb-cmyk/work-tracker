// All shared domain types. Mirrors DATA_MODEL.md — keep field names in sync
// with Firestore and bot/skills/constants.py.

import type { Timestamp } from './lib/time';

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type SprintStatus = 'planning' | 'active' | 'completed';
/**
 * Tầng phân quyền (KHÔNG phải chuyên môn). owner > admin > member: owner có mọi quyền
 * admin (is_admin bao owner) + ĐỘC QUYỀN cấp/đổi vai trò — xem migration 0037.
 */
export type UserRole = 'owner' | 'admin' | 'member';

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Thành viên',
};
export type TaskSource = 'web' | 'discord';

/**
 * Quyền lẻ admin cấp thêm cho member (admin nghiễm nhiên có đủ — xem has_perm(), 0034).
 * Giá trị phải khớp chuỗi RLS dùng trong migration; thêm quyền mới = thêm vào đây
 * + policy tương ứng, KHÔNG cần đổi schema.
 */
export type MemberPerm = 'task.delete' | 'feature.create';

export const MEMBER_PERMS: { id: MemberPerm; label: string; hint: string }[] = [
  { id: 'task.delete', label: 'Xoá task', hint: 'Xoá được task bất kỳ (mặc định chỉ admin và người tạo task)' },
  { id: 'feature.create', label: 'Tạo feature', hint: 'Tạo feature mới; sửa/xoá feature vẫn là việc của admin' },
];

/** Job discipline — separate from the admin/member permission role. */
export type JobRole =
  | 'developer'
  | '2d_artist'
  | 'game_designer'
  | 'sound_designer'
  | 'ui_artist'
  | 'animator'
  | 'vfx_artist'
  | 'qa';

export const JOB_ROLES: { id: JobRole; label: string; icon: string }[] = [
  { id: 'developer', label: 'Developer', icon: '💻' },
  { id: '2d_artist', label: '2D Artist', icon: '🎨' },
  { id: 'game_designer', label: 'Game Designer', icon: '🎮' },
  { id: 'sound_designer', label: 'Sound Designer', icon: '🎵' },
  { id: 'ui_artist', label: 'UI Artist', icon: '🖌️' },
  { id: 'animator', label: 'Animator', icon: '🎞️' },
  // Cạnh Animator: hai vị trí này hay đi cùng nhau trong pipeline.
  { id: 'vfx_artist', label: 'VFX Artist', icon: '✨' },
  { id: 'qa', label: 'QA', icon: '🐞' },
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
  /** Mốc sửa nội dung gần nhất (chỉ bình luận); undefined = chưa sửa. DB tự điền — xem 0029. */
  editedAt?: Timestamp;
}

/**
 * Nhật ký hệ thống (audit log, migration 0035) — hành động quản trị: xoá task, tạo
 * feature, đổi vai trò/quyền member. Ghi bằng trigger DB; client chỉ đọc (admin).
 * `action` để rộng thành string để action mới ở DB không làm gãy client cũ.
 */
export type AuditAction = 'task.delete' | 'feature.create' | 'member.perms';

export interface AuditEntry {
  id: string;
  /** Ai thực hiện — null nếu ghi từ console/không có phiên; actorName='Bot' khi service-role. */
  actorId: string | null;
  actorName: string;
  action: AuditAction | string;
  entityType: string;
  /** Id đối tượng bị tác động (có thể đã bị xoá, vd task). */
  entityId: string | null;
  summary: string;
  projectId: string | null;
  /** Chi tiết có cấu trúc: task.delete → {title,status}; member.perms → {role_*,perms_*}. */
  meta: Record<string, unknown>;
  createdAt?: Timestamp;
}

/** Nhãn + icon cho từng loại hành động trong Nhật ký. `tone` map sang class màu badge. */
export const AUDIT_ACTION_META: Record<string, { label: string; icon: string; tone: 'danger' | 'ok' | 'warn' }> = {
  'task.delete': { label: 'Xoá task', icon: '🗑️', tone: 'danger' },
  'feature.create': { label: 'Tạo feature', icon: '🧩', tone: 'ok' },
  'member.perms': { label: 'Đổi quyền', icon: '🔑', tone: 'warn' },
};

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

/**
 * Một lỗi runtime hiện lên cho người dùng (toast + panel nhật ký).
 *
 * KHÁC `AppNotification`: cái kia là thông báo nghiệp vụ, lưu trong Postgres và gửi cho
 * người khác. Cái này sống trong bộ nhớ tab, chỉ của phiên hiện tại, mất khi F5 — nó trả
 * lời "vừa nãy hỏng cái gì", không phải để lưu trữ.
 */
export interface AppError {
  id: string;
  /** Nhóm hiển thị trên nhãn, vd 'Notion', 'Task'. */
  source: string;
  message: string;
  /**
   * Câu trấn an/ngữ cảnh đi kèm, vd "Task vẫn đã lưu". Không có nó thì một dòng
   * "Notion gateway lỗi 500" trần trụi dễ khiến người dùng tưởng mất luôn task.
   */
  note?: string;
  /** Stack (Error) hoặc JSON (lỗi dạng object) — xổ ra trong panel khi cần. */
  detail?: string;
  at: Date;
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
  /** Quyền lẻ được cấp thêm — chỉ có nghĩa với member; admin có đủ mọi quyền. */
  perms: MemberPerm[];
  jobRole?: JobRole;
  discordId?: string;
  notionUserId?: string;
  createdAt?: Timestamp;
  lastSeenAt?: Timestamp;
}

/** A feature: a unit of product work inside a project. Tasks may attach to one. */
/**
 * delivery = gói bán / thứ ship được cho user thật, có ngày xong (hiện % hoàn thành).
 * ongoing  = việc chạy liên tục (Polish, Gameplay tuning…) — không bao giờ "done",
 *            UI không hiện % mà hiện nhịp làm gần đây.
 */
export type FeatureKind = 'delivery' | 'standard' | 'ongoing';

/** Thứ tự hiện ở ô chọn Loại. Xem migration 0030 (CHECK ở DB chốt đúng ba giá trị này). */
export const FEATURE_KINDS: FeatureKind[] = ['delivery', 'standard', 'ongoing'];

export const FEATURE_KIND_LABEL: Record<FeatureKind, string> = {
  delivery: 'Gói bán',
  standard: 'Tính năng',
  ongoing: 'Liên tục',
};

export const FEATURE_KIND_ICON: Record<FeatureKind, string> = {
  delivery: '🎯',
  standard: '✨',
  ongoing: '🔁',
};

/** Mô tả đầy đủ — hiện ở tooltip, không nhét vào ô chọn (chữ chen nhau, khó đọc). */
export const FEATURE_KIND_HINT: Record<FeatureKind, string> = {
  delivery: 'Thứ bán cho user: IAP, pack, offer. Có ngày xong, card hiện % hoàn thành.',
  standard: 'Tính năng thường, không bán: Settings, Login, Tutorial… Có ngày xong, card hiện % hoàn thành.',
  ongoing: 'Chạy liên tục: polish, tuning — không bao giờ "done". Card hiện nhịp 30 ngày thay vì %.',
};

/** A project-scoped label in the feature tag palette (Shop / Gameplay / …). */
export interface FeatureLabel {
  id: string;
  projectId: string;
  name: string;
  color: string;
  icon: string; // optional emoji
  /**
   * Ngày phát hành đã chốt của nhãn VERSION (migration 0032, nguồn: sheet release).
   * null = nhãn không phải version, hoặc chưa chốt ngày → Timeline suy mốc từ hạn task.
   */
  releaseDate: Timestamp | null;
  createdAt?: Timestamp;
  createdBy: string;
}

export interface Feature {
  id: string;
  projectId: string;
  name: string;
  icon: string; // emoji shown on the card
  color: string; // accent hex
  description: string;
  kind: FeatureKind;
  /** ids into `feature_labels` — nhóm lớn (Shop…) + tag tự do, dùng để lọc. */
  labelIds: string[];
  /** Link tài liệu + ảnh ref dùng chung cho mọi task của feature (migration 0019). */
  attachments: Attachment[];
  /**
   * Mốc ĐÁNH DẤU TAY là đã xong (migration 0031) — cho feature ship từ trước khi có
   * tracker nên không có task để suy ra. null = suy từ task như thường.
   */
  doneAt: Timestamp | null;
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
  /** Google Spreadsheet **id** (không phải URL) bot điền weekly report vào. Rỗng = chưa bật. */
  weeklySheetId: string | null;
  /**
   * Sheet chứa LỊCH PHÁT HÀNH (tab `Timeline`, cột Version | Date) — bot đọc khi bấm
   * "Sync lịch" ở Timeline để điền feature_labels.release_date. KHÁC `weeklySheetId`:
   * đó là sheet báo cáo tuần. Rỗng = dự án không đồng bộ lịch. Migration 0033.
   */
  releaseSheetId: string | null;
  createdAt?: Timestamp;
  createdBy: string;
}

export type BugStatus = 'open' | 'fixing' | 'pending' | 'deployed' | 'done';

export const BUG_STATUSES: BugStatus[] = ['open', 'fixing', 'pending', 'deployed', 'done'];

// Mirrors STATUS_TAG_NAME in lib/bugStatus.ts — these are the Discord forum tag
// names, so display and sync stay on the same vocabulary.
export const BUG_STATUS_LABEL: Record<BugStatus, string> = {
  open: 'Open',
  fixing: 'Fixing',
  pending: 'Pending',
  deployed: 'Deployed',
  done: 'Done',
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
  /**
   * Lúc bug chuyển sang Done, do trigger DB ghi (migration 0018). Bất biến:
   * có giá trị ⟺ status === 'done'.
   *
   * ĐỪNG thay bằng `updatedAt`: sync forum update MỌI bug ở MỌI lần chạy, nên
   * updatedAt là "lần sync gần nhất" chứ không phải "lúc done".
   */
  doneAt?: Timestamp;
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
  /** Mã ngắn duy nhất (DB sinh) cho link chia sẻ gọn `/t/<shortCode>`. Xem migration 0039. */
  shortCode: string | null;
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
