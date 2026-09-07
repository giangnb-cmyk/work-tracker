// Ghi ngày lễ toàn công ty (`holidays`, migration 0085). Admin / 'sprint.manage'.
//
// DB giữ MỘT HÀNG MỖI NGÀY (khoá = ngày) — đơn giản cho phép tra "ngày này có nghỉ không".
// Người dùng thì khai theo DẢI (nghỉ lễ 2/9 là 31/08 → 02/09), nên ở đây tách dải thành
// từng ngày công; T7/CN trong dải bỏ qua vì vốn đã không phải ngày công.

import { supabase } from '../supabase';
import { addDaysIso, isWeekendIso } from './workdays';

/** Dải dài hơn thế này gần chắc là chọn nhầm năm — chặn trước khi ghi cả trăm hàng. */
export const MAX_HOLIDAY_RANGE_DAYS = 60;

/** Các ngày CÔNG (bỏ T7/CN) trong [from, to]. from > to → rỗng. Thuần. */
export function workdaysInRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from, i = 0; d <= to && i < MAX_HOLIDAY_RANGE_DAYS; d = addDaysIso(d, 1), i++) {
    if (!isWeekendIso(d)) out.push(d);
  }
  return out;
}

/**
 * Khai một dải nghỉ [from, to] với cùng tên. Ghi MỘT lệnh upsert cho mọi ngày (không lặp
 * từng ngày); ngày đã có thì đổi tên theo dải mới. Trả về số ngày công đã ghi.
 */
export async function upsertHolidayRange(from: string, to: string, name: string): Promise<number> {
  const days = workdaysInRange(from, to);
  if (days.length === 0) return 0;
  const rows = days.map((day) => ({ day, name: name.trim() }));
  const { error } = await supabase.from('holidays').upsert(rows, { onConflict: 'day' });
  if (error) throw error;
  return days.length;
}

/** Bỏ nhiều ngày lễ một lần (xoá cả dải trong danh sách). */
export async function deleteHolidays(days: string[]): Promise<void> {
  if (days.length === 0) return;
  const { error } = await supabase.from('holidays').delete().in('day', days);
  if (error) throw error;
}
