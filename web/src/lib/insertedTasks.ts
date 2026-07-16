// Thống kê "chèn việc": kế hoạch tuần chốt SÁNG THỨ 2, nên task TẠO MỚI từ thứ 3 trở
// đi là việc bị chèn thêm vào tuần đó (tuần bắt đầu thứ 2, đọc theo giờ máy đang xem —
// cùng quy ước với lib/dateRange.ts). Thuần — không React, không Supabase.

import type { Task, TeamMember } from '../types';
import { UNASSIGNED_UID } from './performance';

const UNASSIGNED_NAME = 'Chưa giao';

/** Ai chèn: member tự tạo cho chính mình, PM (admin) giao xuống, hay nguồn khác. */
export type InsertKind = 'self' | 'admin' | 'other';

export const INSERT_KIND_LABEL: Record<InsertKind, string> = {
  self: 'Tự chèn',
  admin: 'PM chèn',
  other: 'Khác',
};

/** Nhãn NGẮN cho tag trong bảng chi tiết — cột "Người tạo" đã có tên, tag chỉ cần vị trí. */
export const INSERT_KIND_TAG: Record<InsertKind, string> = {
  self: 'Bản thân',
  admin: 'PM',
  other: 'Khác',
};

export interface InsertedTask {
  task: Task;
  createdMs: number;
  kind: InsertKind;
  /** Tên người tạo — 'Không rõ' khi reporter không khớp profile nào (vd bot chưa link). */
  reporterName: string;
}

export interface InsertedMemberRow {
  uid: string;
  name: string;
  photoURL: string;
  total: number;
  self: number;
  byAdmin: number;
  other: number;
  /** Task chèn của người này, mới nhất trước. */
  tasks: InsertedTask[];
}

export interface InsertedSummary {
  total: number;
  self: number;
  byAdmin: number;
  other: number;
  /**
   * Duyệt theo ROSTER (như visitStats/memberPerformance): người không bị chèn vẫn hiện
   * số 0 — "tuần này ai không bị chèn" cũng là thông tin. Dòng "Chưa giao" (nếu có)
   * nằm cuối để tổng theo người khớp tổng chung.
   */
  rows: InsertedMemberRow[];
}

/** Thứ 2 = ngày chốt kế hoạch — task tạo hôm đó là việc ĐÃ lên lịch, không phải chèn. */
export function isPlanningDay(ms: number): boolean {
  return new Date(ms).getDay() === 1;
}

/**
 * PM tự tạo việc cho chính mình vẫn là "tự chèn" — xét self TRƯỚC admin, vì thứ cần
 * đánh giá là "PM chèn CHO NHÂN VIÊN". Role đọc theo hiện tại (không có lịch sử role).
 */
function classify(task: Task, memberById: Map<string, TeamMember>): InsertKind {
  if (task.reporterId && task.reporterId === task.assigneeId) return 'self';
  if (task.reporterId && memberById.get(task.reporterId)?.role === 'admin') return 'admin';
  return 'other';
}

function rowOf(uid: string, name: string, photoURL: string, tasks: InsertedTask[]): InsertedMemberRow {
  return {
    uid,
    name,
    photoURL,
    total: tasks.length,
    self: tasks.filter((t) => t.kind === 'self').length,
    byAdmin: tasks.filter((t) => t.kind === 'admin').length,
    other: tasks.filter((t) => t.kind === 'other').length,
    tasks: [...tasks].sort((a, b) => b.createdMs - a.createdMs),
  };
}

interface Input {
  tasks: Task[];
  members: TeamMember[];
  fromMs: number;
  toMs: number;
}

/** Task chèn trong khoảng [fromMs, toMs], gom theo người ĐANG được giao. */
export function insertedTaskStats({ tasks, members, fromMs, toMs }: Input): InsertedSummary {
  const memberById = new Map(members.map((m) => [m.uid, m]));

  const inserted: InsertedTask[] = [];
  for (const task of tasks) {
    // Task cũ thiếu mốc tạo thì không xếp được vào tuần nào — bỏ qua, không đoán.
    const createdMs = task.createdAt?.toMillis();
    if (createdMs === undefined || createdMs < fromMs || createdMs > toMs) continue;
    if (isPlanningDay(createdMs)) continue;
    inserted.push({
      task,
      createdMs,
      kind: classify(task, memberById),
      reporterName: memberById.get(task.reporterId ?? '')?.displayName ?? 'Không rõ',
    });
  }

  const byAssignee = new Map<string, InsertedTask[]>();
  for (const it of inserted) {
    const key = it.task.assigneeId ?? UNASSIGNED_UID;
    const list = byAssignee.get(key);
    if (list) list.push(it);
    else byAssignee.set(key, [it]);
  }

  const rows = members.map((m) => rowOf(m.uid, m.displayName, m.photoURL, byAssignee.get(m.uid) ?? []));
  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'vi'));
  const orphans = byAssignee.get(UNASSIGNED_UID) ?? [];
  if (orphans.length > 0) rows.push(rowOf(UNASSIGNED_UID, UNASSIGNED_NAME, '', orphans));

  return {
    total: inserted.length,
    self: inserted.filter((t) => t.kind === 'self').length,
    byAdmin: inserted.filter((t) => t.kind === 'admin').length,
    other: inserted.filter((t) => t.kind === 'other').length,
    rows,
  };
}

const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** "T4 15/07 · 09:12" — mốc tạo kèm THỨ, vì "thứ mấy" chính là tiêu chí của phép đếm. */
export function fmtInsertedAt(ms: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${DOW_SHORT[d.getDay()]} ${two(d.getDate())}/${two(d.getMonth() + 1)} · ${two(d.getHours())}:${two(d.getMinutes())}`;
}
