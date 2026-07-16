// Khoảng thời gian cho bộ lọc thống kê (kiểu GA): preset "N phút/giờ/ngày qua",
// "Tuần/Tháng/Năm nay", hoặc khoảng tuỳ chọn từ lịch. Thuần — không React, không Supabase.

export type PresetId =
  | 'm60'
  | 'h12'
  | 'h24'
  | 'd7'
  | 'd30'
  | 'd90'
  | 'week'
  | 'month'
  | 'year';

export interface DateRange {
  fromMs: number;
  toMs: number;
  /** null = khoảng tuỳ chọn người dùng bấm trên lịch. */
  presetId: PresetId | null;
}

export const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'm60', label: '60 phút qua' },
  { id: 'h12', label: '12 giờ qua' },
  { id: 'h24', label: '24 giờ qua' },
  { id: 'd7', label: '7 ngày qua' },
  { id: 'd30', label: '30 ngày qua' },
  { id: 'd90', label: '90 ngày qua' },
  { id: 'week', label: 'Tuần này' },
  { id: 'month', label: 'Tháng này' },
  { id: 'year', label: 'Năm nay' },
];

export function presetLabel(id: PresetId): string {
  return PRESETS.find((p) => p.id === id)?.label ?? '';
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(ms: number): number {
  return startOfDay(ms) + DAY_MS - 1;
}

/** Đầu tuần chứa `ms` — tuần bắt đầu THỨ 2 (đội làm T2–T6), không phải Chủ nhật. */
export function startOfWeek(ms: number): number {
  const d = new Date(startOfDay(ms));
  const dow = d.getDay(); // 0 = CN
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d.getTime();
}

export function startOfMonth(ms: number): number {
  const d = new Date(startOfDay(ms));
  d.setDate(1);
  return d.getTime();
}

export function startOfYear(ms: number): number {
  const d = new Date(startOfDay(ms));
  d.setMonth(0, 1);
  return d.getTime();
}

/**
 * Khoảng thời gian của một preset tính tại thời điểm `nowMs`.
 * "N ngày qua" tính TRÒN NGÀY và bao gồm hôm nay (7 ngày qua = hôm nay + 6 hôm trước),
 * giống cách GA hiển thị "Jul 10 – Jul 16".
 */
export function presetRange(id: PresetId, nowMs: number): DateRange {
  switch (id) {
    case 'm60':
      return { fromMs: nowMs - HOUR_MS, toMs: nowMs, presetId: id };
    case 'h12':
      return { fromMs: nowMs - 12 * HOUR_MS, toMs: nowMs, presetId: id };
    case 'h24':
      return { fromMs: nowMs - 24 * HOUR_MS, toMs: nowMs, presetId: id };
    case 'd7':
      return { fromMs: startOfDay(nowMs) - 6 * DAY_MS, toMs: nowMs, presetId: id };
    case 'd30':
      return { fromMs: startOfDay(nowMs) - 29 * DAY_MS, toMs: nowMs, presetId: id };
    case 'd90':
      return { fromMs: startOfDay(nowMs) - 89 * DAY_MS, toMs: nowMs, presetId: id };
    case 'week':
      return { fromMs: startOfWeek(nowMs), toMs: nowMs, presetId: id };
    case 'month':
      return { fromMs: startOfMonth(nowMs), toMs: nowMs, presetId: id };
    case 'year':
      return { fromMs: startOfYear(nowMs), toMs: nowMs, presetId: id };
  }
}

/**
 * 42 ô (6 tuần) của lưới lịch tháng `month` (0–11), bắt đầu THỨ 2 — gồm cả ngày thừa
 * của tháng trước/sau để lưới luôn vuông, component tự làm mờ ô ngoài tháng.
 */
export function monthGrid(year: number, month: number): Date[] {
  const dow = new Date(year, month, 1).getDay(); // 0 = CN
  const lead = dow === 0 ? 6 : dow - 1;
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(new Date(year, month, 1 - lead + i));
  return cells;
}

export function sameDay(aMs: number, bMs: number): boolean {
  return startOfDay(aMs) === startOfDay(bMs);
}

/** "16/07/2026" — nhãn ngày cho input/trigger. */
export function fmtDay(ms: number): string {
  return new Date(ms).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** "YYYY-MM-DD" theo GIỜ MÁY cho <input type="date"> — không dùng toISOString vì lệch UTC. */
export function toInputDate(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Ngược lại của toInputDate — null nếu chuỗi rỗng/không hợp lệ. */
export function parseInputDate(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const ms = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isNaN(ms) ? null : ms;
}
