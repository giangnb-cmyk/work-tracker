// MỘT luật cho hạn chót mặc định của task theo sprint — dùng chung cho TaskModal (tạo /
// đổi sprint), createTask (QuickAddTaskRow…) và moveTaskToSprint. Thuần, không React.
//
// Luật: hạn = NGÀY KẾT THÚC sprint (cuối ngày). Trước đây là "chủ nhật của tuần chứa ngày
// bắt đầu" từ thời sprint luôn đúng 1 tuần Mon→Sun — luật đó vỡ khi sprint đặt tay bắt đầu
// từ chủ nhật (start = CN 06/09 → hạn = chính 06/09, ngày ĐẦU sprint) hoặc kết thúc lệch
// (end = thứ 2 24/08 → hạn 23/08). Người dùng đặt sprint kết thúc ngày nào thì hạn task
// mặc định là ngày đó; sprint không có end_date mới lùi về chủ nhật của tuần bắt đầu.
//
// Cuối NGÀY THEO GIỜ MÁY (23:59:59 local): end_date trong DB có hai kiểu thời gian (cron
// ghi 16:59:59Z = 23:59:59 VN; Quản lý Sprint ghi 00:00Z = 07:00 VN) — lấy ngày lịch local
// rồi ép về cuối ngày thì cả hai kiểu đều ra cùng một hạn.

import { sundayOfWeek } from './format';

export function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 0);
  return out;
}

/**
 * Hạn mặc định cho task thuộc sprint có ngày (start, end) đã đổi sang Date local.
 * Trả `null` khi sprint không có ngày nào — chỗ gọi tự quyết (để trống / cuối tuần).
 */
export function defaultDueForSprint(startDate: Date | null | undefined, endDate: Date | null | undefined): Date | null {
  if (endDate) return endOfDay(endDate);
  if (startDate) return sundayOfWeek(startDate);
  return null;
}
