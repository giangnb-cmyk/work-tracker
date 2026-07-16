// Gom lượt truy cập trong một khoảng thời gian [fromMs, toMs]. Thuần — không React,
// không Supabase. Khoảng do người xem chọn từ DateRangePicker (preset hoặc lịch),
// logic mốc tuần/tháng/năm nằm ở lib/dateRange.ts.

import type { TeamMember } from '../types';

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
  /** Số lượt trong khoảng đang chọn. */
  visits: number;
  /** Số NGÀY khác nhau có vào — 20 lượt dồn 1 ngày khác hẳn 20 lượt trải 20 ngày. */
  activeDays: number;
  /** Lượt gần nhất (ms), null nếu chưa vào lần nào trong khoảng. */
  lastAtMs: number | null;
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

interface Input {
  visits: Visit[];
  members: TeamMember[];
  fromMs: number;
  toMs: number;
}

export interface VisitSummary {
  /** Tổng lượt trong khoảng. */
  total: number;
  /** Số người có ít nhất 1 lượt. */
  activeUsers: number;
  /** Người trong danh sách nhưng KHÔNG vào lần nào trong khoảng — chính là phát hiện cần thấy. */
  idleUsers: number;
  rows: VisitRow[];
}

/**
 * Thống kê theo người trong khoảng đang chọn.
 *
 * Duyệt theo ROSTER chứ không theo lượt: người không vào lần nào VẪN phải hiện với số 0 —
 * đó mới là thứ admin cần nhìn. (Cùng tinh thần với memberPerformance ở lib/performance.ts.)
 */
export function visitStats({ visits, members, fromMs, toMs }: Input): VisitSummary {
  const inRange = visits.filter((v) => v.atMs >= fromMs && v.atMs <= toMs);

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
    rows,
  };
}
