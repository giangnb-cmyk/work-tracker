// Việc hoàn thành NGOÀI giờ làm ("OT"). Sprint chạy T2→CN nhưng đội chỉ làm T2→T6, nên
// mọi việc đánh dấu xong vào T7/CN là làm thêm. Thuần — không React, không Supabase,
// không Date.now(): mốc thời gian đi vào qua tham số.
//
// Thứ được đọc theo GIỜ MÁY, cùng quy ước với sprintRange.ts (đội ở UTC+7, máy cũng vậy).
// Xem máy ở múi giờ khác thì ranh giới ngày sẽ lệch — đây là đánh đổi có chủ ý, đổi lại
// không phải kéo cả thư viện timezone vào bundle.

import { UNASSIGNED_UID, type PerfCtx } from './performance';
import type { Bug, Task, TeamMember } from '../types';

/** getDay(): 0 = CN, 6 = T7. */
const WEEKEND_DAYS = new Set([0, 6]);
const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const UNASSIGNED_NAME = 'Chưa giao';

export type WorkItemKind = 'task' | 'bug';

/** Một việc đã xong, đã biết mốc thời gian — đủ để trả lời "task gì, xong lúc nào". */
export interface OvertimeItem {
  id: string;
  kind: WorkItemKind;
  title: string;
  doneAtMs: number;
  /** Nhãn thứ, vd "T7" — để bảng khỏi phải tự suy ra từ timestamp. */
  dayLabel: string;
}

export interface MemberOvertime {
  uid: string;
  name: string;
  photoURL: string;
  /** Việc xong trong T2→T6. */
  weekday: number;
  /** Việc xong T7/CN — phần OT. */
  weekend: number;
  /** Đã xong nhưng KHÔNG có mốc thời gian → không xếp được vào tuần hay cuối tuần. */
  unknown: number;
  /** % OT trên số việc xếp được (weekday + weekend); `unknown` không nằm ở mẫu số. */
  percentWeekend: number;
  /** Chỉ các việc OT, mới nhất trước. */
  items: OvertimeItem[];
}

export interface OvertimeSummary {
  weekday: number;
  weekend: number;
  unknown: number;
  percentWeekend: number;
  /** Theo người, người OT nhiều nhất lên đầu. */
  rows: MemberOvertime[];
}

export function isWeekendMs(ms: number): boolean {
  return WEEKEND_DAYS.has(new Date(ms).getDay());
}

export function dayLabelOf(ms: number): string {
  return DAY_LABELS[new Date(ms).getDay()];
}

function percent(weekday: number, weekend: number): number {
  const known = weekday + weekend;
  return known === 0 ? 0 : Math.round((weekend / known) * 100);
}

interface Bucket {
  weekday: number;
  weekend: number;
  unknown: number;
  items: OvertimeItem[];
}

function emptyBucket(): Bucket {
  return { weekday: 0, weekend: 0, unknown: 0, items: [] };
}

/** Xếp một việc đã xong vào đúng ngăn. `doneAtMs` null = thiếu mốc, không đoán. */
function tally(bucket: Bucket, kind: WorkItemKind, id: string, title: string, doneAtMs: number | null) {
  if (doneAtMs === null) {
    bucket.unknown += 1;
    return;
  }
  if (!isWeekendMs(doneAtMs)) {
    bucket.weekday += 1;
    return;
  }
  bucket.weekend += 1;
  bucket.items.push({ id, kind, title, doneAtMs, dayLabel: dayLabelOf(doneAtMs) });
}

interface OvertimeInput {
  /** Task đã lọc về khoảng sprint đang xem (xem tasksInRange). */
  tasks: Task[];
  /** Bug đã fix xong trong khoảng (xem bugsDoneInRange). */
  bugs: Bug[];
  members: TeamMember[];
  ctx: PerfCtx;
}

/**
 * Tách việc đã xong thành trong-tuần / cuối-tuần, tổng và theo từng người.
 *
 * Dùng CHUNG đầu vào với `memberPerformance` để hai bảng không đá nhau: cùng tập task
 * (`status === 'done'`) và cùng tập bug. Mốc xong của task lấy từ RPC `task_report`
 * (`firstDoneAt` — lần đánh dấu xong ĐẦU TIÊN, nên bật/tắt lại trạng thái không đổi kết
 * quả); task cũ chưa có lịch sử trạng thái rơi vào `unknown` chứ không bị đoán bừa.
 */
export function overtimeBreakdown({ tasks, bugs, members, ctx }: OvertimeInput): OvertimeSummary {
  const byOwner = new Map<string, Bucket>();
  const bucketOf = (uid: string) => {
    const found = byOwner.get(uid);
    if (found) return found;
    const fresh = emptyBucket();
    byOwner.set(uid, fresh);
    return fresh;
  };

  for (const task of tasks) {
    if (task.status !== 'done') continue;
    const doneAt = ctx.reports.get(task.id)?.firstDoneAt?.toMillis() ?? null;
    tally(bucketOf(task.assigneeId ?? UNASSIGNED_UID), 'task', task.id, task.title, doneAt);
  }
  for (const bug of bugs) {
    tally(bucketOf(bug.assigneeId ?? UNASSIGNED_UID), 'bug', bug.id, bug.title, bug.doneAt?.toMillis() ?? null);
  }

  const named = new Map(members.map((m) => [m.uid, m]));
  // Chỉ dựng dòng cho người CÓ việc xong trong khoảng: bảng này trả lời "ai OT", người
  // không xong việc nào chỉ là một dòng 0/0 gây nhiễu (khác MemberPerfTable — ở đó dòng
  // rỗng chính là phát hiện cần thấy).
  const rows = [...byOwner.entries()]
    .map(([uid, b]) => ({
      uid,
      name: named.get(uid)?.displayName ?? (uid === UNASSIGNED_UID ? UNASSIGNED_NAME : 'Người đã rời'),
      photoURL: named.get(uid)?.photoURL ?? '',
      weekday: b.weekday,
      weekend: b.weekend,
      unknown: b.unknown,
      percentWeekend: percent(b.weekday, b.weekend),
      items: [...b.items].sort((x, y) => y.doneAtMs - x.doneAtMs),
    }))
    .filter((r) => r.weekday + r.weekend + r.unknown > 0)
    .sort((a, b) => b.weekend - a.weekend || b.weekday - a.weekday || a.name.localeCompare(b.name, 'vi'));

  const weekday = rows.reduce((sum, r) => sum + r.weekday, 0);
  const weekend = rows.reduce((sum, r) => sum + r.weekend, 0);
  return {
    weekday,
    weekend,
    unknown: rows.reduce((sum, r) => sum + r.unknown, 0),
    percentWeekend: percent(weekday, weekend),
    rows,
  };
}
