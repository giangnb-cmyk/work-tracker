// Gom lượt truy cập theo kỳ (tuần / tháng / năm). Thuần — không React, không Supabase.
// `nowMs` truyền từ ngoài vào để mọi dòng trong một lần render dùng chung một mốc.

import type { TeamMember } from '../types';

export type Period = 'week' | 'month' | 'year';

export const PERIOD_LABEL: Record<Period, string> = {
  week: 'Tuần này',
  month: 'Tháng này',
  year: 'Năm nay',
};

/** Một lượt truy cập đã đọc từ DB. */
export interface Visit {
  id: string;
  userId: string;
  atMs: number;
}

export interface VisitRow {
  uid: string;
  name: string;
  photoURL: string;
  /** Số lượt trong kỳ đang chọn. */
  visits: number;
  /** Số NGÀY khác nhau có vào — 20 lượt dồn 1 ngày khác hẳn 20 lượt trải 20 ngày. */
  activeDays: number;
  /** Lượt gần nhất (ms), null nếu chưa vào lần nào trong kỳ. */
  lastAtMs: number | null;
}

/**
 * Mốc bắt đầu của kỳ chứa `nowMs`, theo GIỜ MÁY.
 *
 * Tuần bắt đầu THỨ 2 (đội làm T2–T6, xem lib/overtime.ts) chứ không phải Chủ nhật như
 * mặc định của getDay().
 */
export function periodStart(nowMs: number, period: Period): Date {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const dow = d.getDay(); // 0 = CN
    const backToMonday = dow === 0 ? 6 : dow - 1;
    d.setDate(d.getDate() - backToMonday);
    return d;
  }
  if (period === 'month') {
    d.setDate(1);
    return d;
  }
  d.setMonth(0, 1);
  return d;
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

interface Input {
  visits: Visit[];
  members: TeamMember[];
  nowMs: number;
  period: Period;
}

export interface VisitSummary {
  /** Tổng lượt trong kỳ. */
  total: number;
  /** Số người có ít nhất 1 lượt. */
  activeUsers: number;
  /** Người trong danh sách nhưng KHÔNG vào lần nào trong kỳ — chính là phát hiện cần thấy. */
  idleUsers: number;
  fromMs: number;
  rows: VisitRow[];
}

/**
 * Thống kê theo người trong kỳ đang chọn.
 *
 * Duyệt theo ROSTER chứ không theo lượt: người không vào lần nào VẪN phải hiện với số 0 —
 * đó mới là thứ admin cần nhìn. (Cùng tinh thần với memberPerformance ở lib/performance.ts.)
 */
export function visitStats({ visits, members, nowMs, period }: Input): VisitSummary {
  const fromMs = periodStart(nowMs, period).getTime();
  const inRange = visits.filter((v) => v.atMs >= fromMs && v.atMs <= nowMs);

  const byUser = new Map<string, Visit[]>();
  for (const v of inRange) {
    const list = byUser.get(v.userId);
    if (list) list.push(v);
    else byUser.set(v.userId, [v]);
  }

  const rows: VisitRow[] = members.map((m) => {
    const own = byUser.get(m.uid) ?? [];
    return {
      uid: m.uid,
      name: m.displayName,
      photoURL: m.photoURL ?? '',
      visits: own.length,
      activeDays: new Set(own.map((v) => dayKey(v.atMs))).size,
      lastAtMs: own.length ? Math.max(...own.map((v) => v.atMs)) : null,
    };
  });
  rows.sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name, 'vi'));

  return {
    total: inRange.length,
    activeUsers: rows.filter((r) => r.visits > 0).length,
    idleUsers: rows.filter((r) => r.visits === 0).length,
    fromMs,
    rows,
  };
}
