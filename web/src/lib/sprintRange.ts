// Ngữ nghĩa cửa sổ thời gian của sprint: sprint đang ở giai đoạn nào, sắp xếp theo
// thời gian, cắt khoảng A→B. Thuần — không React, không Supabase, không Date.now().

import type { Sprint } from '../types';

const DAY_MS = 86_400_000;
const FAR_FUTURE = Number.MAX_SAFE_INTEGER;

export type SprintPhase = 'finished' | 'running' | 'upcoming' | 'unknown';

/**
 * Mốc kết thúc thật: HẾT ngày end_date theo giờ máy, không phải giá trị thô trong DB.
 *
 * SprintManager lưu <input type="date"> qua `new Date(start)` → UTC midnight, mà đội ở
 * UTC+7: sprint kết thúc 14/07 nằm trong DB là 14/07 07:00 giờ VN. So thẳng
 * `endDate < now` sẽ báo trễ từ 7 giờ sáng ngày cuối sprint, trong khi đội còn nguyên
 * một ngày làm việc.
 */
export function sprintEndMs(sprint: Sprint): number | null {
  const end = sprint.endDate?.toDate();
  if (!end) return null;
  const local = new Date(end);
  local.setHours(0, 0, 0, 0);
  return local.getTime() + DAY_MS;
}

/**
 * Mốc bắt đầu thật: ĐẦU ngày start_date theo giờ máy — đối xứng với `sprintEndMs`.
 *
 * Cùng cái bẫy múi giờ: start_date thô là UTC midnight, tức 07:00 giờ VN, nên so thẳng
 * sẽ loại mất việc làm xong trong buổi sáng sớm của chính ngày đầu sprint.
 */
export function sprintStartMs(sprint: Sprint): number | null {
  const start = sprint.startDate?.toDate();
  if (!start) return null;
  const local = new Date(start);
  local.setHours(0, 0, 0, 0);
  return local.getTime();
}

/**
 * Trả về giai đoạn chứ không phải boolean, để chỗ mập mờ hiện ra thay vì bị đoán ngầm:
 * sprint không ngày và không chạy thì là 'unknown' → UI hiện "—" chứ không đổ lỗi cho ai.
 */
export function sprintPhase(sprint: Sprint, nowMs: number): SprintPhase {
  if (sprint.status === 'completed') return 'finished';
  const endMs = sprintEndMs(sprint);
  if (endMs === null) return sprint.status === 'active' ? 'running' : 'unknown';
  if (endMs <= nowMs) return 'finished'; // hết hạn mà chưa ai đóng — vẫn tính là đã xong
  return sprint.status === 'active' ? 'running' : 'upcoming';
}

export function isSprintFinished(sprint: Sprint, nowMs: number): boolean {
  return sprintPhase(sprint, nowMs) === 'finished';
}

function sprintSortKey(sprint: Sprint): number {
  return sprint.startDate?.toMillis() ?? sprint.createdAt?.toMillis() ?? FAR_FUTURE;
}

/**
 * Cũ → mới theo startDate; sprint chưa đặt ngày thì lấy createdAt (sprint vừa tạo sẽ
 * nằm cuối một cách tự nhiên), thiếu cả hai mới bị đẩy hẳn xuống cuối.
 * Có tiebreak cố định để hai sprint cùng ngày không đảo chỗ giữa các lần render —
 * nếu đảo thì trục x của biểu đồ xu hướng sẽ nhảy.
 */
export function sortSprintsChronologically(sprints: Sprint[]): Sprint[] {
  return [...sprints].sort(
    (a, b) =>
      sprintSortKey(a) - sprintSortKey(b) ||
      a.name.localeCompare(b.name, 'vi') ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Cắt khoảng A→B. `sorted` PHẢI đã theo thứ tự thời gian (gọi
 * `sortSprintsChronologically` trước) — hàm này không tự sort lại.
 * Chọn ngược (A sau B) vẫn ra đúng khoảng, nên không cần tráo lựa chọn của người dùng.
 */
export function sprintsInRange(sorted: Sprint[], fromId: string, toId: string): Sprint[] {
  const from = sorted.findIndex((s) => s.id === fromId);
  const to = sorted.findIndex((s) => s.id === toId);
  if (from < 0 || to < 0) return [];
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  return sorted.slice(lo, hi + 1);
}
