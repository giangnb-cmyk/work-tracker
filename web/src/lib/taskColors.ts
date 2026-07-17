// Thang màu của task, tách khỏi component để chỗ nào cũng dùng được (dòng task, bộ lọc).
// Cùng khuôn với lib/bugStatus.ts.

import type { TaskPriority, TaskStatus } from '../types';

/** Cùng thang màu ở card (TaskRow) lẫn dòng (TaskListRow) để hai dạng đọc như một. */
export const PRIO_COLOR: Record<TaskPriority, string> = {
  low: '#94a3b8',
  medium: '#fbbf24',
  high: '#fb923c',
  urgent: '#ef4444',
};

/** Màu trạng thái — chỉ dùng để tô nhãn trong bộ lọc cho dễ quét mắt. */
export const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: '#94a3b8',
  in_progress: '#38bdf8',
  review: '#c084fc',
  done: '#22c55e',
};
