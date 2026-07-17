// Thin client for the /api/notion gateway. Isolates all network I/O so hooks/components
// stay declarative. Every call attaches the current user's Supabase access token.

import { supabase } from '../supabase';
import { toInputDate } from './format';
import type { Task } from '../types';

/** Current Supabase access token (JWT) for authenticating gateway calls. */
async function authToken(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

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
  notionProjectId?: string | null;
  dueStart?: string | null;
  dueDate?: string | null;
  description?: string;
}

export interface NotionProjectOption {
  id: string;
  name: string;
}

async function callGateway(body: unknown): Promise<SyncResult> {
  const token = await authToken();
  if (!token) throw new Error('Chưa đăng nhập.');

  const res = await fetch('/api/notion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // Nói ra NGUYÊN NHÂN thay vì mỗi con số: 3 mã này ứng với 3 chỗ hỏng hoàn toàn khác
    // nhau, mà "Notion gateway 503" thì không ai đoán được phải đi sửa ở đâu.
    if (res.status === 503) {
      throw new Error(
        'Server chưa cấu hình xác thực: thiếu SUPABASE_URL / SUPABASE_ANON_KEY ở /api ' +
          '(Vercel → Settings → Environment Variables, rồi Redeploy).',
      );
    }
    if (res.status === 401) throw new Error('Phiên đăng nhập hết hạn. Tải lại trang rồi thử lại.');
    if (res.status === 502) {
      throw new Error(
        'Notion từ chối yêu cầu. Hay gặp nhất: NOTION_PROP_* trỏ vào cột không có trong ' +
          'Notion DB (vd cột Priority). Xem log Vercel để biết chi tiết.',
      );
    }
    // Gateway tự trả 401/502/503 cho mọi lỗi nó lường trước, nên tới được đây (hay gặp
    // nhất là 500) tức là nó chết ngoài dự tính. Bám theo `detail` server gửi kèm nếu có:
    // không có nó thì chỉ còn mỗi con số, phải đi mò log terminal/Vercel mới lần ra.
    const detail = await res.json().then((b: { detail?: string }) => b?.detail).catch(() => undefined);
    throw new Error(`Notion gateway lỗi ${res.status}.${detail ? ` Chi tiết: ${detail}` : ''}`);
  }
  return (await res.json()) as SyncResult;
}

function toPayload(
  task: Task,
  assigneeNotionUserId?: string | null,
  notionProjectId?: string | null,
): NotionTaskPayload {
  const payload: NotionTaskPayload = {
    title: task.title,
    status: task.status,
    priority: task.priority,
    assigneeName: task.assigneeName,
    assigneeNotionUserId: assigneeNotionUserId ?? null,
    dueStart: task.dueStart ? toInputDate(task.dueStart) : null,
    dueDate: task.dueDate ? toInputDate(task.dueDate) : null,
    description: task.description,
  };
  // Only touch the Notion Project relation when a value was explicitly provided,
  // so status-only updates (moveTask) don't wipe it.
  if (notionProjectId !== undefined) payload.notionProjectId = notionProjectId;
  return payload;
}

/** Create a Notion page for a task. Returns page id + url, or a not-synced result. */
export function createNotionPage(
  task: Task,
  assigneeNotionUserId?: string | null,
  notionProjectId?: string | null,
) {
  return callGateway({ action: 'create', task: toPayload(task, assigneeNotionUserId, notionProjectId) });
}

/** Update the linked Notion page's status/assignee/due/project. */
export function updateNotionPage(
  notionPageId: string,
  task: Task,
  assigneeNotionUserId?: string | null,
  notionProjectId?: string | null,
) {
  return callGateway({
    action: 'update',
    notionPageId,
    task: toPayload(task, assigneeNotionUserId, notionProjectId),
  });
}

/**
 * Đẩy trang Notion của một task vào Trash khi task bị xoá trong app.
 *
 * Notion API không có "xoá vĩnh viễn" — trang nằm trong Trash 30 ngày rồi mới mất, nên
 * lỡ tay vẫn khôi phục được. Chỉ nhận `notionPageId` (không nhận tên/tiêu đề): workspace
 * Notion dùng chung cả công ty, đụng nhầm trang là hỏng việc người khác.
 */
export function archiveNotionPage(notionPageId: string) {
  return callGateway({ action: 'archive', notionPageId });
}

/** Fetch the selectable Notion projects (for linking an in-app project). */
export async function listNotionProjects(): Promise<NotionProjectOption[]> {
  const token = await authToken();
  if (!token) throw new Error('Chưa đăng nhập.');
  const res = await fetch('/api/notion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'list-projects' }),
  });
  if (!res.ok) throw new Error(`Notion gateway ${res.status}`);
  const data = (await res.json()) as { projects?: NotionProjectOption[] };
  return data.projects ?? [];
}
