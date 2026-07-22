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
  /** Checklist -> to-do block trong thân trang Notion. Có MẶT = gateway đồng bộ lại cả
   *  checklist; VẮNG = để yên (cập nhật status/… không đụng tới subtask). */
  subtasks?: { title: string; done: boolean }[];
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
    // `detail` do gateway gửi kèm (api/notion.ts) — đọc TRƯỚC mọi nhánh và dùng cho mọi mã.
    // Trên Vercel không có shim dev nào để mò, và log Vercel thì chỉ admin mới vào được:
    // không đính lý do thật vào ngay đây là người bấm nút chỉ còn mỗi con số.
    const detail = await res
      .json()
      .then((b: { detail?: string }) => b?.detail?.trim() || undefined)
      .catch(() => undefined);
    const withDetail = (msg: string) => new Error(detail ? `${msg} Chi tiết: ${detail}` : msg);

    // Nói ra NGUYÊN NHÂN thay vì mỗi con số: mỗi mã ứng với một chỗ hỏng khác hẳn nhau,
    // mà "Notion gateway 503" thì không ai đoán được phải đi sửa ở đâu.
    if (res.status === 503) {
      throw withDetail(
        'Server chưa cấu hình xác thực: thiếu SUPABASE_URL / SUPABASE_ANON_KEY ở /api ' +
          '(Vercel → Settings → Environment Variables, rồi Redeploy).',
      );
    }
    if (res.status === 401) throw withDetail('Phiên đăng nhập hết hạn. Tải lại trang rồi thử lại.');
    if (res.status === 502) {
      throw withDetail(
        'Notion từ chối yêu cầu. Hay gặp nhất: NOTION_PROP_* trỏ vào cột không có trong Notion DB.',
      );
    }
    throw withDetail(`Notion gateway lỗi ${res.status}.`);
  }
  return (await res.json()) as SyncResult;
}

function toPayload(
  task: Task,
  assigneeNotionUserId?: string | null,
  notionProjectId?: string | null,
  withSubtasks = false,
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
  // Chỉ gửi subtasks khi được yêu cầu (tạo mới, hoặc update mà subtask VỪA đổi) — gửi bừa
  // ở mỗi lần đổi status là ghi lại cả checklist trên Notion vô ích + có thể xoá to-do
  // người ta tự thêm.
  // `?? []`: caller hay dựng Task RÚT GỌN (createTask từng thiếu subtasks → "Cannot read
  // properties of undefined (reading 'map')" ở MỌI lần tạo task). Side-sync không được nổ
  // vì một trường vắng — thiếu thì coi như checklist rỗng.
  if (withSubtasks) {
    payload.subtasks = (task.subtasks ?? []).map((s) => ({ title: s.title, done: s.done }));
  }
  return payload;
}

/** Create a Notion page for a task. Returns page id + url, or a not-synced result. */
export function createNotionPage(
  task: Task,
  assigneeNotionUserId?: string | null,
  notionProjectId?: string | null,
) {
  // Tạo mới -> luôn gửi subtasks để dựng checklist ban đầu.
  return callGateway({ action: 'create', task: toPayload(task, assigneeNotionUserId, notionProjectId, true) });
}

/**
 * Update the linked Notion page. `subtasksChanged` = subtask VỪA đổi ở lần lưu này ->
 * mới đồng bộ lại checklist; mặc định false để cập nhật status/… không đụng to-do.
 */
export function updateNotionPage(
  notionPageId: string,
  task: Task,
  assigneeNotionUserId?: string | null,
  notionProjectId?: string | null,
  subtasksChanged = false,
) {
  return callGateway({
    action: 'update',
    notionPageId,
    task: toPayload(task, assigneeNotionUserId, notionProjectId, subtasksChanged),
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
