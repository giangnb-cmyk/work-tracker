// Kỳ đánh giá → [start, end] dạng 'YYYY-MM-DD'. Toán ranh giới kỳ nằm HẲN ở đây (web); bot chỉ
// nhận ngày rồi lọc sprint GIAO khoảng. Date-only để tránh lệch múi giờ (giống quy ước phần Chi phí).

import type { PeriodKind } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m1: number, d: number) => `${y}-${pad(m1)}-${pad(d)}`;

/** Ngày cuối của tháng m1 (1..12). new Date(y, m1, 0) = ngày 0 của tháng KẾ = ngày cuối tháng này. */
function lastDayOfMonth(year: number, m1: number): number {
  return new Date(year, m1, 0).getDate();
}

export function monthRange(year: number, m1: number): { start: string; end: string } {
  return { start: iso(year, m1, 1), end: iso(year, m1, lastDayOfMonth(year, m1)) };
}

export function quarterRange(year: number, q: number): { start: string; end: string } {
  const firstMonth = (q - 1) * 3 + 1; // q1→1, q2→4, q3→7, q4→10
  const lastMonth = firstMonth + 2;
  return { start: iso(year, firstMonth, 1), end: iso(year, lastMonth, lastDayOfMonth(year, lastMonth)) };
}

/** Khoảng kỳ theo loại: month → index là tháng 1..12; quarter → index là quý 1..4. */
export function periodRange(kind: PeriodKind, year: number, index: number): { start: string; end: string } {
  return kind === 'month' ? monthRange(year, index) : quarterRange(year, index);
}

/** Nhãn kỳ từ start 'YYYY-MM-DD'. "Tháng 7/2026" / "Quý 3/2026". */
export function periodLabel(kind: PeriodKind, start: string): string {
  const [y, m] = start.split('-').map(Number);
  return kind === 'month' ? `Tháng ${m}/${y}` : `Quý ${Math.floor((m - 1) / 3) + 1}/${y}`;
}
