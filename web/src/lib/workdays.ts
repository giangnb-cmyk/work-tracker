// Ngày công = T2–T6 trừ ngày lễ (bảng holidays). Thuần — không React, không Supabase.
//
// Ngày dạng 'YYYY-MM-DD'. Mọi phép tính đi qua Date.UTC: `new Date('2026-09-01')` là nửa
// đêm UTC, đọc getDay() ở máy VN (UTC+7) vẫn đúng nhưng ở máy UTC-x thì lệch sang hôm
// trước — dùng getUTC* cho chắc, không phụ thuộc múi giờ người mở web.

const DAY_MS = 86_400_000;
/** Trần độ dài khoảng cần duyệt — nhập nhầm năm 2099 thì thôi, không treo tab để đếm. */
const MAX_SPAN_DAYS = 2000;

const pad = (n: number) => String(n).padStart(2, '0');

export function isoToUtcMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function utcMsToIso(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Cộng/trừ N ngày LỊCH. */
export function addDaysIso(iso: string, days: number): string {
  return utcMsToIso(isoToUtcMs(iso) + days * DAY_MS);
}

export function isWeekendIso(iso: string): boolean {
  const wd = new Date(isoToUtcMs(iso)).getUTCDay();
  return wd === 0 || wd === 6;
}

/** Ngày công: không phải T7/CN và không nằm trong danh sách lễ. */
export function isWorkday(iso: string, holidays: ReadonlySet<string>): boolean {
  return !isWeekendIso(iso) && !holidays.has(iso);
}

/** Số ngày công trong [from, to] — bao cả hai đầu. from > to → 0. */
export function countWorkdays(from: string, to: string, holidays: ReadonlySet<string>): number {
  const start = isoToUtcMs(from);
  const end = Math.min(isoToUtcMs(to), start + MAX_SPAN_DAYS * DAY_MS);
  let n = 0;
  for (let ms = start; ms <= end; ms += DAY_MS) {
    if (isWorkday(utcMsToIso(ms), holidays)) n++;
  }
  return n;
}

/**
 * Ngày rơi vào ngày công thứ `n` kể từ `from` (from tính là thứ 1 nếu nó là ngày công).
 * Dùng để suy "làm với tốc độ này thì xong hôm nào". n <= 0 → trả về `from`.
 */
export function nthWorkdayFrom(from: string, n: number, holidays: ReadonlySet<string>): string {
  if (n <= 0) return from;
  let ms = isoToUtcMs(from);
  const limit = ms + MAX_SPAN_DAYS * DAY_MS;
  let seen = 0;
  while (ms <= limit) {
    const iso = utcMsToIso(ms);
    if (isWorkday(iso, holidays) && ++seen === n) return iso;
    ms += DAY_MS;
  }
  return utcMsToIso(limit);
}
