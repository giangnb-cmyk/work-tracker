// Thống kê hiệu suất theo khoảng sprint. Thuần — không React, không Supabase.
// `nowMs` luôn truyền từ ngoài vào để mọi dòng trong một lần render dùng chung một mốc.

import { isSprintFinished, sprintEndMs, sprintPhase, sprintStartMs, type SprintPhase } from './sprintRange';
import type { Bug, Sprint, Task, TeamMember } from '../types';
import type { Timestamp } from './time';

const DAY_MS = 86_400_000;

/** Bucket cho task không có người nhận — phải hiện, nếu không tổng theo người sẽ không khớp tổng sprint. */
export const UNASSIGNED_UID = '__unassigned__';
const UNASSIGNED_NAME = 'Chưa giao';

/** Một dòng từ RPC `task_report` (migration 0016). */
export interface TaskReport {
  taskId: string;
  /** Sprint đã đi qua, THEO THỨ TỰ thời gian được thêm vào. Thứ tự có ý nghĩa. */
  sprintIds: string[];
  firstInProgressAt: Timestamp | null;
  firstDoneAt: Timestamp | null;
}

/** Ngữ cảnh dùng chung cho mọi phép tính trong file này. */
export interface PerfCtx {
  reports: Map<string, TaskReport>;
  /** Mọi sprint, không chỉ sprint trong khoảng — lịch sử task có thể trỏ ra ngoài. */
  sprintById: Map<string, Sprint>;
  nowMs: number;
}

function historyOf(taskId: string, ctx: PerfCtx): string[] {
  return ctx.reports.get(taskId)?.sprintIds ?? [];
}

/** Mọi task từng thuộc sprint này — kể cả task nay đã bị đẩy sang sprint khác. */
export function tasksOfSprint(tasks: Task[], sprintId: string, ctx: PerfCtx): Task[] {
  return tasks.filter((t) => historyOf(t.id, ctx).includes(sprintId));
}

/** Mọi task từng thuộc bất kỳ sprint nào trong khoảng. */
export function tasksInRange(tasks: Task[], rangeIds: Set<string>, ctx: PerfCtx): Task[] {
  return tasks.filter((t) => historyOf(t.id, ctx).some((id) => rangeIds.has(id)));
}

// ---------------------------------------------------------------------------
// Bug fix xong trong thời gian sprint
// ---------------------------------------------------------------------------
//
// Bug KHÔNG gắn sprint (`bugs` không có sprint_id, và cũng không nên có: nó đến từ
// forum Discord). Quy về sprint thuần bằng NGÀY: bug có `doneAt` rơi trong khoảng
// start→end của sprint thì tính là một việc hoàn thành trong sprint đó.

/** Bug đã fix xong trong khoảng ngày của một sprint. Sprint thiếu ngày -> không quy được. */
export function bugsDoneInSprint(bugs: Bug[], sprint: Sprint): Bug[] {
  // Dùng chung mốc với sprintPhase/isSprintFinished — tự tính lại ở đây là hai định
  // nghĩa "sprint kết thúc lúc nào" sẽ trôi lệch nhau.
  const from = sprintStartMs(sprint);
  const to = sprintEndMs(sprint);
  if (from == null || to == null) return [];
  return bugs.filter((b) => {
    const at = b.doneAt?.toMillis();
    return at != null && at >= from && at <= to;
  });
}

/**
 * Bug fix xong trong BẤT KỲ sprint nào của khoảng đang xem.
 * Bỏ trùng theo id: không có gì ép các sprint không chồng ngày lên nhau, mà một bug
 * lọt vào hai sprint thì sẽ bị đếm hai lần.
 */
export function bugsDoneInRange(bugs: Bug[], sprints: Sprint[]): Bug[] {
  const seen = new Map<string, Bug>();
  for (const sprint of sprints) {
    for (const bug of bugsDoneInSprint(bugs, sprint)) seen.set(bug.id, bug);
  }
  return [...seen.values()];
}

/**
 * "Task này trễ mấy sprint" — đếm số sprint ĐÃ KẾT THÚC mà task không hoàn thành trong đó:
 * sprint cũ task đã rời đi, cộng sprint hiện tại nếu nó đã đóng mà task vẫn chưa xong.
 */
export function lateSprintCount(task: Task, ctx: PerfCtx): number {
  let count = 0;
  for (const sprintId of historyOf(task.id, ctx)) {
    const sprint = ctx.sprintById.get(sprintId);
    if (!sprint || !isSprintFinished(sprint, ctx.nowMs)) continue;
    const isCurrent = sprintId === task.sprintId;
    if (!isCurrent || task.status !== 'done') count += 1;
  }
  return count;
}

/**
 * Số ngày từ lúc task thật sự bắt đầu được tính đến lúc xong lần đầu.
 * Đồng hồ chạy từ khi task VÀO SPRINT đầu tiên chứ không từ lúc tạo: thời gian nằm chờ
 * ở backlog không phải lỗi của người làm. Trả null khi thiếu dữ liệu — không đoán.
 */
export function completionDays(task: Task, ctx: PerfCtx): number | null {
  const doneAt = ctx.reports.get(task.id)?.firstDoneAt;
  const createdMs = task.createdAt?.toMillis();
  if (!doneAt || createdMs === undefined) return null;
  const firstSprintId = historyOf(task.id, ctx)[0];
  const sprintStartMs = firstSprintId
    ? ctx.sprintById.get(firstSprintId)?.startDate?.toMillis()
    : undefined;
  const startMs = sprintStartMs === undefined ? createdMs : Math.max(createdMs, sprintStartMs);
  return Math.max(0, (doneAt.toMillis() - startMs) / DAY_MS);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// ---------------------------------------------------------------------------
// Theo sprint
// ---------------------------------------------------------------------------

export interface SprintCompletion {
  sprint: Sprint;
  phase: SprintPhase;
  total: number;
  done: number;
  percentDone: number;
  /** Task từng ở sprint này nhưng nay đã sang sprint khác. */
  carriedAway: number;
  late: number;
  /** false khi sprint chưa kết thúc → UI hiện "—" thay vì con số vô nghĩa. */
  isLateKnown: boolean;
}

export function sprintCompletion(sprints: Sprint[], tasks: Task[], ctx: PerfCtx): SprintCompletion[] {
  return sprints.map((sprint) => {
    const ever = tasksOfSprint(tasks, sprint.id, ctx);
    // "Xong" của sprint này = task còn ở đây VÀ đã xong. Task đã rời đi thì rõ ràng
    // không hoàn thành trong sprint này, dù sau đó có xong ở sprint khác.
    const done = ever.filter((t) => t.sprintId === sprint.id && t.status === 'done').length;
    const carriedAway = ever.filter((t) => t.sprintId !== sprint.id).length;
    const phase = sprintPhase(sprint, ctx.nowMs);
    const finished = phase === 'finished';
    return {
      sprint,
      phase,
      total: ever.length,
      done,
      percentDone: ever.length === 0 ? 0 : Math.round((done / ever.length) * 100),
      carriedAway,
      late: finished ? ever.length - done : 0,
      isLateKnown: finished,
    };
  });
}

// ---------------------------------------------------------------------------
// Theo người
// ---------------------------------------------------------------------------

export interface MemberPerf {
  uid: string;
  name: string;
  photoURL: string;
  total: number;
  /** Task xong + bug fix xong trong khoảng — con số "hoàn thành" hiển thị cho người dùng. */
  done: number;
  /** Phần bug trong `done`. Tách ra để UI nói được "12 (5 bug)" thay vì gộp mập mờ. */
  doneBugs: number;
  donePoints: number;
  percentDone: number;
  /** Số task của người này trễ ít nhất một sprint. */
  late: number;
  /** Task tệ nhất của người này đã trễ mấy sprint. */
  maxLateSprints: number;
  medianDays: number | null;
  meanDays: number | null;
  /** Số task xong có đủ dữ liệu mốc thời gian. */
  sampleSize: number;
  /** sampleSize / done — dưới ngưỡng thì UI làm mờ thay vì in số trông chắc chắn. */
  coverage: number;
}

interface MemberPerfInput {
  tasks: Task[]; // đã lọc về khoảng sprint đang xem
  bugs: Bug[]; // bug đã fix xong trong khoảng — xem bugsDoneInRange
  members: TeamMember[];
  ctx: PerfCtx;
}

/**
 * Duyệt theo ROSTER chứ không theo task: người không có task nào trong khoảng VẪN phải
 * xuất hiện (đó chính là phát hiện cần thấy) — khác hẳn `rankByDone` của lib/sprint.ts.
 * Thêm một dòng "Chưa giao" để tổng theo người khớp tổng theo sprint.
 */
export function memberPerformance({ tasks, bugs, members, ctx }: MemberPerfInput): MemberPerf[] {
  const byOwner = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = task.assigneeId ?? UNASSIGNED_UID;
    const list = byOwner.get(key);
    if (list) list.push(task);
    else byOwner.set(key, [task]);
  }

  const bugsByOwner = new Map<string, Bug[]>();
  for (const bug of bugs) {
    const key = bug.assigneeId ?? UNASSIGNED_UID;
    const list = bugsByOwner.get(key);
    if (list) list.push(bug);
    else bugsByOwner.set(key, [bug]);
  }

  const rows = members.map((m) =>
    scoreOwner(m.uid, m.displayName, m.photoURL, byOwner.get(m.uid) ?? [], bugsByOwner.get(m.uid) ?? [], ctx),
  );
  const orphans = byOwner.get(UNASSIGNED_UID) ?? [];
  const orphanBugs = bugsByOwner.get(UNASSIGNED_UID) ?? [];
  if (orphans.length > 0 || orphanBugs.length > 0) {
    rows.push(scoreOwner(UNASSIGNED_UID, UNASSIGNED_NAME, '', orphans, orphanBugs, ctx));
  }
  return rows.sort((a, b) => b.done - a.done || b.donePoints - a.donePoints || a.name.localeCompare(b.name, 'vi'));
}

function scoreOwner(
  uid: string,
  name: string,
  photoURL: string,
  owned: Task[],
  ownedBugs: Bug[],
  ctx: PerfCtx,
): MemberPerf {
  const done = owned.filter((t) => t.status === 'done');
  const lateCounts = owned.map((t) => lateSprintCount(t, ctx));
  const days = done.map((t) => completionDays(t, ctx)).filter((d): d is number => d !== null);

  // Bug chỉ cộng vào phần ĐÃ XONG. Bug chưa fix không quy được về sprint nào (nó không
  // có sprint_id, và chỉ khớp theo doneAt) nên không thể tính là "việc của sprint này".
  const doneBugs = ownedBugs.length;
  const total = owned.length + doneBugs;
  const doneAll = done.length + doneBugs;

  return {
    uid,
    name,
    photoURL,
    total,
    done: doneAll,
    doneBugs,
    donePoints: done.reduce((sum, t) => sum + (t.points ?? 0), 0),
    percentDone: total === 0 ? 0 : Math.round((doneAll / total) * 100),
    // Các số đo dưới đây CỐ Ý chỉ tính trên task: bug không có lịch sử sprint lẫn mốc
    // bắt đầu, nên không có gì để đo trễ hay số ngày.
    late: lateCounts.filter((n) => n > 0).length,
    maxLateSprints: lateCounts.length === 0 ? 0 : Math.max(...lateCounts),
    medianDays: median(days),
    meanDays: mean(days),
    sampleSize: days.length,
    // Mẫu số là TASK đã xong, không gồm bug — nếu không, dev fix càng nhiều bug thì
    // chỉ số thời gian càng trông thiếu tin cậy, dù dữ liệu task chẳng hề tệ đi.
    coverage: done.length === 0 ? 0 : days.length / done.length,
  };
}

// ---------------------------------------------------------------------------
// Xu hướng
// ---------------------------------------------------------------------------

export interface TrendSeries {
  labels: string[];
  datasets: { uid: string; name: string; data: number[] }[];
}

/**
 * Task đã xong theo sprint — tính theo SPRINT TASK ĐANG THUỘC VỀ, khớp với bảng sprint.
 * Khác với "task hoàn thành trong cửa sổ thời gian của sprint đó"; tiêu đề UI phải nói rõ.
 */
export function doneTrend(sprints: Sprint[], perf: MemberPerf[], tasks: Task[]): TrendSeries {
  const doneByOwnerSprint = new Map<string, number>();
  for (const task of tasks) {
    if (task.status !== 'done' || !task.sprintId) continue;
    const key = `${task.assigneeId ?? UNASSIGNED_UID}|${task.sprintId}`;
    doneByOwnerSprint.set(key, (doneByOwnerSprint.get(key) ?? 0) + 1);
  }
  return {
    labels: sprints.map((s) => s.name),
    datasets: perf
      .filter((p) => p.done > 0) // người không xong task nào chỉ tạo segment rỗng
      .map((p) => ({
        uid: p.uid,
        name: p.name,
        data: sprints.map((s) => doneByOwnerSprint.get(`${p.uid}|${s.id}`) ?? 0),
      })),
  };
}
