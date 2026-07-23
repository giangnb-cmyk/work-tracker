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
   * Người tham gia THÊM TAY (uid → profiles.id), migration 0046. UI gộp với người suy ra
   * từ ai có task; task mới thuộc feature auto-gắn cả hai nhóm vào `watcherIds`.
   */
  memberIds: string[];
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
  /**
   * Webhook Discord cho báo cáo task hằng ngày (10:30) — job daily-report ngoài đọc
   * qua Supabase và gửi report của project này vào đây. Rỗng = project không gửi.
   */
  dailyReportWebhook: string | null;
  createdAt?: Timestamp;
  createdBy: string;
}

/* ===========================================================================
   Chi phí dự án (tab "Chi phí" — phần Quản trị). Xem migration 0053.
   Ngày để dạng chuỗi 'YYYY-MM-DD' (date-only) — tính theo THÁNG nên không cần giờ,
   và tránh lệch múi giờ khi Timestamp làm tròn về UTC.
   =========================================================================== */

/**
 * Lương + thời gian làm việc của một NGƯỜI — TOÀN CỤC, không theo dự án (bảng
 * member_compensation). Điền ở chi tiết thành viên (MemberModal). Nhạy cảm → admin-only.
 */
export interface MemberComp {
  memberId: string;
  monthlySalary: number;
  startDate: string | null; // 'YYYY-MM-DD'
  endDate: string | null; // 'YYYY-MM-DD' — null = còn đang làm
}

/** Một dòng nhân sự trong bảng chi phí dự án = thành viên của dự án + lương toàn cục của họ. */
export interface CostEmployeeRow {
  memberId: string;
  name: string;
  photoURL?: string;
  /** Vị trí/chuyên môn (từ profiles.job_role) — hiện dưới tên trong bảng Chi phí nhân sự. */
  jobRole?: JobRole;
  monthlySalary: number;
  startDate: string | null;
  endDate: string | null;
}

/** one_time = ban đầu 1 lần; monthly = theo tháng (×số tháng); annual = theo năm (×số tháng/12). */
export type CostItemKind = 'one_time' | 'annual' | 'monthly';

export const COST_ITEM_KINDS: CostItemKind[] = ['one_time', 'monthly', 'annual'];
export const COST_ITEM_KIND_LABEL: Record<CostItemKind, string> = {
  one_time: 'Ban đầu (1 lần)',
  monthly: 'Theo tháng',
  annual: 'Theo năm',
};

/**
 * Một khoản chi phí thiết bị/vận hành — DANH MỤC để gán cho từng người/dòng dự chi
 * (migration 0056). Khoản KHÔNG gán cho ai (Văn phòng, Điện…) tính một lần cho cả dự án.
 */
export interface CostItem {
  id: string;
  projectId: string;
  name: string;
  amount: number;
  kind: CostItemKind;
  sortOrder: number;
  createdAt?: Timestamp;
  createdBy: string;
}

/** Một lần đổi lương (member_comp_history — trigger 0057 ghi, client chỉ đọc). */
export interface CompChange {
  id: string;
  memberId: string;
  /** null = điền lương lần đầu. */
  oldSalary: number | null;
  newSalary: number;
  /** Ngày ÁP DỤNG mức mới ('YYYY-MM-DD', 0058); null = không ghi → dùng changedAt. */
  effectiveFrom: string | null;
  changedAt: Timestamp | null;
}

/** Cấu hình chi phí của dự án (project_cost_settings, 0059) — hiện là thưởng Tết. */
export interface CostSettings {
  projectId: string;
  /** Số THÁNG LƯƠNG thưởng Tết mỗi người (mặc định 1; 0 = tắt). */
  tetBonusMonths: number;
  /** Tháng dương trả thưởng (1–12, mặc định 1). */
  tetBonusMonth: number;
}

/** Doanh thu DỰ KIẾN của một tháng (project_revenue, 0059). `month` = ISO ngày đầu tháng. */
export interface RevenueEntry {
  projectId: string;
  month: string;
  amount: number;
}

/** Một bậc DỰ TÍNH tăng lương (member_salary_plan, 0059) — toàn cục theo người. */
export interface SalaryPlanRow {
  id: string;
  memberId: string;
  effectiveFrom: string; // 'YYYY-MM-DD'
  monthlySalary: number;
}

/** Các khoản chi phí đã gán cho MỘT người trong dự án (project_cost_member_items). */
export interface CostMemberItems {
  projectId: string;
  memberId: string;
  /** ids vào project_cost_items — id khoản đã xoá có thể còn sót, phía đọc tự lọc. */
  itemIds: string[];
}

/** Nhịp phát sinh của một khoản dự chi trong khoảng tháng đang xem. */
export type CostCadence = 'monthly' | 'one_time' | 'annual';

export const COST_CADENCES: CostCadence[] = ['monthly', 'one_time', 'annual'];
export const COST_CADENCE_LABEL: Record<CostCadence, string> = {
  monthly: 'Hàng tháng',
  one_time: '1 lần',
  annual: 'Hàng năm',
};

/** hire = tuyển thêm nhân sự; outsource = thuê ngoài. */
export type CostProjectionKind = 'hire' | 'outsource';

export const COST_PROJECTION_KINDS: CostProjectionKind[] = ['hire', 'outsource'];
export const COST_PROJECTION_KIND_LABEL: Record<CostProjectionKind, string> = {
  hire: 'Tuyển thêm',
  outsource: 'Outsource',
};
export const COST_PROJECTION_KIND_ICON: Record<CostProjectionKind, string> = {
  hire: '🧑‍💼',
  outsource: '🌐',
};

/** Một dòng DỰ CHI (what-if): tuyển thêm vị trí X lương Y, hoặc một khoản outsource. */
export interface CostProjection {
  id: string;
  projectId: string;
  kind: CostProjectionKind;
  label: string;
  amount: number;
  cadence: CostCadence;
  /** Số người / số suất (mặc định 1). */
  headCount: number;
  /** Khoản thiết bị/vận hành đi kèm mỗi suất (ids vào project_cost_items, 0056). */
  itemIds: string[];
  sortOrder: number;
  createdAt?: Timestamp;
  createdBy: string;
}

// 'reopen' = bug Done bị tái hiện, tester mở lại (tag Discord "Re-open"). Đứng cạnh Open
// vì cùng là "cần xử lý". Enum DB thêm ở migration 0055.
export type BugStatus = 'open' | 'reopen' | 'fixing' | 'pending' | 'deployed' | 'done';

export const BUG_STATUSES: BugStatus[] = ['open', 'reopen', 'fixing', 'pending', 'deployed', 'done'];

// Mirrors STATUS_TAG_NAME in lib/bugStatus.ts — these are the Discord forum tag
// names, so display and sync stay on the same vocabulary.
export const BUG_STATUS_LABEL: Record<BugStatus, string> = {
  open: 'Open',
  reopen: 'Re-open',
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

/* ===========================================================================
   Đánh giá thành viên theo SPRINT (tab "Đánh giá" — admin). Xem migration 0059/0060.
   Nhạy cảm (đánh giá của quản lý) → admin-only cả đọc lẫn ghi, như member_compensation.
   =========================================================================== */

export type PeriodKind = 'month' | 'quarter';

/** Ghi chú có cấu trúc cho MỘT người trong MỘT sprint (một dòng dùng chung, sửa-đè). */
export interface MemberSprintNote {
  id: string;
  memberId: string;
  sprintId: string;
  overview: string; // Tổng quan ("tuần này thế nào")
  highlights: string; // Điểm nổi bật
  concerns: string; // Điểm cần lưu ý
  rating: number | null; // 1..5, null = chưa chấm
  updatedBy: string | null;
  updatedAt?: Timestamp;
  createdAt?: Timestamp;
  /** Chỉ có khi select kèm embed sprints(...) — dùng cho lịch sử trong MemberModal. */
  sprintName?: string;
  sprintStart?: Timestamp | null;
}

/** Bản đánh giá tổng hợp theo THÁNG/QUÝ do AI (bot) sinh từ các note trong kỳ (migration 0060). */
export interface MemberPeriodReview {
  id: string;
  memberId: string;
  periodKind: PeriodKind;
  periodStart: string; // 'YYYY-MM-DD'
  periodEnd: string;
  summary: string; // văn bản AI (markdown)
  sourceNoteCount: number;
  model: string;
  status: 'done' | 'empty'; // empty = kỳ không có note (khỏi tốn LLM)
  generatedAt?: Timestamp;
  generatedBy: string | null;
}

/** Thang điểm đánh giá 1..5 — nguồn sự thật (nhãn + icon) giống JOB_ROLES. */
export const NOTE_RATINGS: { value: number; label: string; icon: string }[] = [
  { value: 1, label: 'Cần cải thiện', icon: '🔴' },
  { value: 2, label: 'Dưới kỳ vọng', icon: '🟠' },
  { value: 3, label: 'Đạt', icon: '🟡' },
  { value: 4, label: 'Tốt', icon: '🟢' },
  { value: 5, label: 'Xuất sắc', icon: '⭐' },
];

export const NOTE_RATING_LABEL: Record<number, string> = NOTE_RATINGS.reduce(
  (acc, r) => ({ ...acc, [r.value]: r.label }),
  {} as Record<number, string>,
);
