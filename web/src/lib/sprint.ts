// Pure sprint analytics — derives stats from a task list. No Firestore/React here.

import type { Sprint, Task, TaskStatus } from '../types';
import { TASK_STATUSES } from '../types';

export interface SprintStats {
  total: number;
  byStatus: Record<TaskStatus, number>;
  donePoints: number;
  totalPoints: number;
  percentDone: number; // 0..100 by task count
  overdue: number;
}

export function computeStats(tasks: Task[]): SprintStats {
  const byStatus = { todo: 0, in_progress: 0, review: 0, done: 0 } as Record<TaskStatus, number>;
  let donePoints = 0;
  let totalPoints = 0;
  let overdue = 0;
  const now = Date.now();

  for (const t of tasks) {
    byStatus[t.status] += 1;
    totalPoints += t.points ?? 0;
    if (t.status === 'done') donePoints += t.points ?? 0;
    if (t.status !== 'done' && t.dueDate && t.dueDate.toDate().getTime() < now) overdue += 1;
  }

  const total = tasks.length;
  const percentDone = total === 0 ? 0 : Math.round((byStatus.done / total) * 100);
  return { total, byStatus, donePoints, totalPoints, percentDone, overdue };
}

export function groupByAssignee(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = t.assigneeName || 'Chưa giao';
    const arr = map.get(key) ?? [];
    arr.push(t);
    map.set(key, arr);
  }
  return map;
}

/**
 * Ideal-vs-actual burndown by remaining task count across the sprint window.
 * Returns one point per day between start and end (inclusive), capped at 30 days.
 */
export function burndownSeries(sprint: Sprint, tasks: Task[]) {
  const start = sprint.startDate?.toDate();
  const end = sprint.endDate?.toDate();
  if (!start || !end || end <= start) return { labels: [], ideal: [], actual: [] };

  const dayMs = 86_400_000;
  const days = Math.min(30, Math.round((end.getTime() - start.getTime()) / dayMs) + 1);
  const total = tasks.length;
  const labels: string[] = [];
  const ideal: number[] = [];
  const actual: (number | null)[] = [];
  const now = Date.now();

  for (let i = 0; i < days; i++) {
    const day = new Date(start.getTime() + i * dayMs);
    labels.push(day.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }));
    ideal.push(Math.round((total * (days - 1 - i)) / (days - 1)));

    // Actual remaining = tasks not "done" by the end of this day. Only up to today.
    if (day.getTime() > now) {
      actual.push(null);
      continue;
    }
    const endOfDay = day.getTime() + dayMs;
    const remaining = tasks.filter((t) => {
      const doneAt = t.status === 'done' ? t.updatedAt?.toDate().getTime() ?? 0 : Infinity;
      return doneAt >= endOfDay;
    }).length;
    actual.push(remaining);
  }

  return { labels, ideal, actual };
}

export const STATUS_ORDER = TASK_STATUSES;
