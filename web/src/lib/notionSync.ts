// Thin client for the /api/notion gateway. Isolates all network I/O so hooks/components
// stay declarative. Every call attaches the current user's Firebase ID token.

import { auth } from '../firebase';
import { toInputDate } from './format';
import type { Task } from '../types';

interface SyncResult {
  synced: boolean;
  notionPageId?: string;
  notionUrl?: string;
  reason?: string;
}

interface NotionTaskPayload {
  title: string;
  status: string;
  priority?: string;
  assigneeName?: string;
  assigneeNotionUserId?: string | null;
  dueDate?: string | null;
  description?: string;
}

async function callGateway(body: unknown): Promise<SyncResult> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Chưa đăng nhập.');

  const res = await fetch('/api/notion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Notion gateway ${res.status}`);
  return (await res.json()) as SyncResult;
}

function toPayload(task: Task, assigneeNotionUserId?: string | null): NotionTaskPayload {
  return {
    title: task.title,
    status: task.status,
    priority: task.priority,
    assigneeName: task.assigneeName,
    assigneeNotionUserId: assigneeNotionUserId ?? null,
    dueDate: task.dueDate ? toInputDate(task.dueDate) : null,
    description: task.description,
  };
}

/** Create a Notion page for a task. Returns page id + url, or a not-synced result. */
export function createNotionPage(task: Task, assigneeNotionUserId?: string | null) {
  return callGateway({ action: 'create', task: toPayload(task, assigneeNotionUserId) });
}

/** Update the linked Notion page's status/assignee/due. */
export function updateNotionPage(
  notionPageId: string,
  task: Task,
  assigneeNotionUserId?: string | null,
) {
  return callGateway({
    action: 'update',
    notionPageId,
    task: toPayload(task, assigneeNotionUserId),
  });
}
