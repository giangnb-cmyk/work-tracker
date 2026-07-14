// All shared domain types. Mirrors DATA_MODEL.md — keep field names in sync
// with Firestore and bot/skills/constants.py.

import type { Timestamp } from 'firebase/firestore';

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type SprintStatus = 'planning' | 'active' | 'completed';
export type UserRole = 'admin' | 'member';
export type TaskSource = 'web' | 'discord';

export const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];
export const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Cần làm',
  in_progress: 'Đang làm',
  review: 'Review',
  done: 'Hoàn thành',
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  urgent: 'Gấp',
};

export interface TeamMember {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: UserRole;
  discordId?: string;
  notionUserId?: string;
  createdAt?: Timestamp;
  lastSeenAt?: Timestamp;
}

export interface Sprint {
  id: string;
  name: string;
  goal: string;
  status: SprintStatus;
  startDate: Timestamp | null;
  endDate: Timestamp | null;
  createdAt?: Timestamp;
  createdBy: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  sprintId: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  assigneeName: string;
  reporterId: string;
  points: number;
  tags: string[];
  dueDate: Timestamp | null;
  order: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  source: TaskSource;
  notionPageId?: string | null;
  notionUrl?: string | null;
}

/** Payload used when creating a task from the UI (server fills timestamps/id). */
export type NewTaskInput = Pick<
  Task,
  'title' | 'description' | 'sprintId' | 'status' | 'priority' | 'points'
> & {
  assigneeId: string | null;
  dueDate: Date | null;
};
