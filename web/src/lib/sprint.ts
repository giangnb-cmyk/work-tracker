// Pure sprint analytics — derives stats from a task list. No Firestore/React here.

import type { JobRole, Sprint, Task, TaskStatus, TeamMember } from '../types';
import { TASK_STATUSES } from '../types';

/**
 * Sprint ĐANG CHẠY = sprint mà khoảng [startDate, endDate] chứa `nowMs`.
 *
 * Xét theo THỜI GIAN, KHÔNG theo cột `status`: sprint tuần tự tạo (pg_cron) không ai bấm
 * "active" tay, mà mốc thời gian mới là sự thật — task tạo trong tuần phải bám sprint của
 * tuần đó. `status` giờ chỉ còn để hiển thị / đóng sớm bằng tay.
 *
 * Thiếu start hoặc end thì bỏ qua (không xếp được vào trục thời gian). Nhiều sprint cùng
 * phủ `now` (lỡ tạo chồng) -> lấy cái BẮT ĐẦU MUỘN NHẤT: tuần mới đè tuần cũ.
 */
export function activeSprintAt(sprints: Sprint[], nowMs: number): Sprint | null {
  let best: Sprint | null = null;
  let bestStart = -Infinity;
  for (const s of sprints) {
    const start = s.startDate?.toMillis();
    const end = s.endDate?.toMillis();
    if (start == null || end == null) continue;
    if (nowMs >= start && nowMs <= end && start > bestStart) {
      best = s;
      bestStart = start;
    }
  }
  return best;
}

export interface SprintStats {
  total: number;
  byStatus: Record<TaskStatus, number>;
  donePoints: number;
  totalPoints: number;
  percentDone: number; // 0..100 by task count
  overdue: number;
}

export function computeStats(tasks: Task[]): SprintStats {
  const byStatus = { todo: 0, in_progress: 0, review: 0, done: 0 } as Record<TaskStatus, number>;
  let donePoints = 0;
  let totalPoints = 0;
  let overdue = 0;
  const now = Date.now();

  for (const t of tasks) {
    byStatus[t.status] += 1;
    totalPoints += t.points ?? 0;
    if (t.status === 'done') donePoints += t.points ?? 0;
    if (t.status !== 'done' && t.dueDate && t.dueDate.toDate().getTime() < now) overdue += 1;
  }

  const total = tasks.length;
  const percentDone = total === 0 ? 0 : Math.round((byStatus.done / total) * 100);
  return { total, byStatus, donePoints, totalPoints, percentDone, overdue };
}

export function groupByAssignee(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = t.assigneeName || 'Chưa giao';
    const arr = map.get(key) ?? [];
    arr.push(t);
    map.set(key, arr);
  }
  return map;
}

/** Thành tích của một thành viên trong phạm vi task được truyền vào (thường là 1 sprint). */
export interface MemberScore {
  uid: string;
  name: string;
  photoURL: string;
  done: number;
  total: number;
  /** Story points của riêng phần task đã hoàn thành. */
  donePoints: number;
  percentDone: number; // 0..100
}

/**
 * Xếp hạng thành viên theo số task đã hoàn thành, nhiều nhất trước.
 * Chỉ tính task đã có người nhận — ai không có task nào trong phạm vi này thì không lên bảng.
 */
export function rankByDone(tasks: Task[], members: TeamMember[]): MemberScore[] {
  const memberByUid = new Map(members.map((m) => [m.uid, m]));
  const buckets = new Map<string, Omit<MemberScore, 'uid' | 'percentDone'>>();

  for (const t of tasks) {
    if (!t.assigneeId) continue; // task chưa giao không thuộc về ai
    const member = memberByUid.get(t.assigneeId);
    const b = buckets.get(t.assigneeId) ?? {
      name: member?.displayName || t.assigneeName || 'Không rõ',
      photoURL: member?.photoURL ?? '',
      done: 0,
      total: 0,
      donePoints: 0,
    };
    b.total += 1;
    if (t.status === 'done') {
      b.done += 1;
      b.donePoints += t.points ?? 0;
    }
    buckets.set(t.assigneeId, b);
  }

  return [...buckets.entries()]
    .map(([uid, b]) => ({
      uid,
      ...b,
      percentDone: b.total === 0 ? 0 : Math.round((b.done / b.total) * 100),
    }))
    .sort((a, b) => b.done - a.done || b.donePoints - a.donePoints || a.name.localeCompare(b.name, 'vi'));
}

/**
 * Cắt bảng xếp hạng thành hai đầu (nhiều nhất / ít nhất) sao cho không ai đứng cả hai bên:
 * đội càng ít người thì mỗi đầu càng co lại, dưới 2 người thì bỏ hẳn đầu "ít nhất".
 * Khúc giữa bị giấu là có chủ ý — bảng "Khối lượng theo người" bên dưới vẫn liệt kê đủ.
 */
export function splitLeaders(ranked: MemberScore[], size = 5): { top: MemberScore[]; bottom: MemberScore[] } {
  if (ranked.length < 2) return { top: ranked, bottom: [] };
  const n = Math.min(size, Math.floor(ranked.length / 2));
  return { top: ranked.slice(0, n), bottom: ranked.slice(-n).reverse() };
}

/** Job-role bucket key: a concrete JobRole, or 'unknown' when the assignee has none. */
export type DeptKey = JobRole | 'unknown';

export interface DeptGroup {
  key: DeptKey;
  total: number;
  done: number;
  percentDone: number; // 0..100 by task count
}

/**
 * Groups tasks by the assignee's job discipline (department) and computes completion.
 * Resolves each task's assigneeId through the members roster; unmatched → 'unknown'.
 * Returns only non-empty departments, most tasks first.
 */
export function groupByJobRole(tasks: Task[], members: TeamMember[]): DeptGroup[] {
  const roleByUid = new Map(members.map((m) => [m.uid, m.jobRole]));
  const buckets = new Map<DeptKey, { total: number; done: number }>();

  for (const t of tasks) {
    const key: DeptKey = (t.assigneeId && roleByUid.get(t.assigneeId)) || 'unknown';
    const b = buckets.get(key) ?? { total: 0, done: 0 };
    b.total += 1;
    if (t.status === 'done') b.done += 1;
    buckets.set(key, b);
  }

  return [...buckets.entries()]
    .map(([key, b]) => ({
      key,
      total: b.total,
      done: b.done,
      percentDone: b.total === 0 ? 0 : Math.round((b.done / b.total) * 100),
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Ideal-vs-actual burndown by remaining task count across the sprint window.
 * Returns one point per day between start and end (inclusive), capped at 30 days.
 */
export function burndownSeries(sprint: Sprint, tasks: Task[]) {
  const start = sprint.startDate?.toDate();
  const end = sprint.endDate?.toDate();
  if (!start || !end || end <= start) return { labels: [], ideal: [], actual: [] };

  const dayMs = 86_400_000;
  const days = Math.min(30, Math.round((end.getTime() - start.getTime()) / dayMs) + 1);
  const span = days - 1; // số khoảng ngày; sprint gói trong 1 ngày → span = 0
  const total = tasks.length;
  const labels: string[] = [];
  const ideal: number[] = [];
  const actual: (number | null)[] = [];
  const now = Date.now();

  for (let i = 0; i < days; i++) {
    const day = new Date(start.getTime() + i * dayMs);
    labels.push(day.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }));
    ideal.push(span === 0 ? 0 : Math.round((total * (span - i)) / span));

    // Actual remaining = tasks not "done" by the end of this day. Only up to today.
    if (day.getTime() > now) {
      actual.push(null);
      continue;
    }
    const endOfDay = day.getTime() + dayMs;
    const remaining = tasks.filter((t) => {
      const doneAt = t.status === 'done' ? t.updatedAt?.toDate().getTime() ?? 0 : Infinity;
      return doneAt >= endOfDay;
    }).length;
    actual.push(remaining);
  }

  return { labels, ideal, actual };
}

/** Sức khoẻ sprint đọc từ đường burndown tại thời điểm hôm nay. */
export type SprintHealthKey =
  | 'unknown'      // thiếu ngày bắt đầu/kết thúc, hoặc sprint rỗng
  | 'not_started'  // chưa tới ngày bắt đầu
  | 'done'         // không còn task nào tồn đọng
  | 'ahead'        // dưới đường lý tưởng
  | 'on_track'
  | 'at_risk'
  | 'behind';

export interface SprintHealth {
  key: SprintHealthKey;
  /** Số task còn lại hôm nay (điểm cuối của đường "Thực tế"). */
  remaining: number;
  /** Đường "Lý tưởng" đang ở đâu hôm nay. */
  ideal: number;
  /** ideal − remaining: >0 là sớm hơn kế hoạch, <0 là chậm hơn. */
  variance: number;
  /** Phần trăm thời gian sprint đã trôi qua (0..100). */
  percentElapsed: number;
}

// Lệch trong khoảng ±10% tổng số task vẫn coi là bám sát đường lý tưởng.
const HEALTH_TOLERANCE_RATIO = 0.1;

/**
 * Trạng thái sprint suy ra từ chính chuỗi burndown, nên badge luôn khớp biểu đồ:
 * so khoảng cách giữa "Thực tế" và "Lý tưởng" tại ngày gần nhất có dữ liệu.
 */
export function sprintHealth(sprint: Sprint, tasks: Task[]): SprintHealth {
  const { ideal, actual } = burndownSeries(sprint, tasks);
  const percentElapsed = elapsedPercent(sprint);
  const today = todayIndex(actual);

  if (ideal.length === 0) {
    return { key: 'unknown', remaining: tasks.length, ideal: 0, variance: 0, percentElapsed };
  }
  if (today < 0) {
    return { key: 'not_started', remaining: tasks.length, ideal: ideal[0] ?? 0, variance: 0, percentElapsed };
  }

  const remaining = actual[today] ?? 0;
  const idealNow = ideal[today] ?? 0;
  const variance = idealNow - remaining;
  return {
    key: healthKey(remaining, variance, tasks.length, percentElapsed),
    remaining,
    ideal: idealNow,
    variance,
    percentElapsed,
  };
}

/** Ngày gần nhất còn dữ liệu thực tế; −1 khi sprint chưa bắt đầu (mọi điểm đều null). */
function todayIndex(actual: (number | null)[]): number {
  for (let i = actual.length - 1; i >= 0; i--) {
    if (actual[i] !== null) return i;
  }
  return -1;
}

function elapsedPercent(sprint: Sprint): number {
  const start = sprint.startDate?.toDate().getTime();
  const end = sprint.endDate?.toDate().getTime();
  if (!start || !end || end <= start) return 0;
  const ratio = (Date.now() - start) / (end - start);
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}

/** Quy khoảng lệch hôm nay thành một trạng thái; dung sai co giãn theo cỡ sprint. */
function healthKey(remaining: number, variance: number, total: number, percentElapsed: number): SprintHealthKey {
  if (total === 0) return 'unknown';
  if (remaining === 0) return 'done';
  if (percentElapsed >= 100) return 'behind'; // hết hạn mà vẫn còn task tồn
  const tolerance = Math.max(1, Math.round(total * HEALTH_TOLERANCE_RATIO));
  if (variance > tolerance) return 'ahead';
  if (variance >= -tolerance) return 'on_track';
  return variance < -tolerance * 2 ? 'behind' : 'at_risk';
}

export const STATUS_ORDER = TASK_STATUSES;

const STATUS_STAGE: Record<TaskStatus, number> = {
  todo: 0,
  in_progress: 40,
  review: 75,
  done: 100,
};

/**
 * Task completion percent (0–100). Uses subtask checklist when present, otherwise
 * falls back to the status stage — so every task shows meaningful progress even if
 * people are lazy about moving status.
 */
export function taskProgress(task: Task): number {
  if (task.status === 'done') return 100; // a completed task is always 100%
  const subs = task.subtasks ?? [];
  if (subs.length > 0) {
    const done = subs.filter((s) => s.done).length;
    return Math.round((done / subs.length) * 100);
  }
  return STATUS_STAGE[task.status];
}
