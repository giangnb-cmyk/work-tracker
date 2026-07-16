// Task write operations — Supabase mutations + best-effort Notion sync.
// Kept out of React so any component can call them. Notion sync is fire-and-forget:
// Postgres is the source of truth if Notion fails.

import { supabase } from '../supabase';
import { archiveNotionPage, createNotionPage, updateNotionPage } from './notionSync';
import { taskPatchToRow } from './mappers';
import { endOfWorkWeek } from './format';
import { Timestamp } from './time';
import type { NewTaskInput, Task, TaskStatus } from '../types';

interface CreateOpts {
  reporterId: string;
  assigneeName: string;
  assigneeNotionUserId?: string | null;
  notionProjectId?: string | null;
  watcherNames: string[];
}

export async function createTask(input: NewTaskInput, opts: CreateOpts): Promise<string> {
  // Auto due window: starts today, ends Friday of this week (unless a due end was picked).
  const now = new Date();
  const dueStart = Timestamp.fromDate(now);
  const dueDate = Timestamp.fromDate(input.dueDate ?? endOfWorkWeek(now));

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title: input.title.trim(),
      description: input.description.trim(),
      sprint_id: input.sprintId,
      project_id: input.projectId,
      feature_id: input.featureId,
      status: input.status,
      priority: input.priority,
      assignee_id: input.assigneeId,
      assignee_name: opts.assigneeName,
      reporter_id: opts.reporterId || null,
      points: input.points,
      due_start: dueStart.toISOString(),
      due_date: dueDate.toISOString(),
      order: Date.now(),
      source: 'web',
      attachments: input.attachments ?? [],
      subtasks: input.subtasks ?? [],
      watcher_ids: input.watcherIds ?? [],
      watcher_names: opts.watcherNames ?? [],
    })
    .select('id')
    .single();
  if (error) throw error;

  const id = data.id as string;
  const created = {
    id,
    title: input.title,
    description: input.description,
    status: input.status,
    priority: input.priority,
    assigneeName: opts.assigneeName,
    dueStart,
    dueDate,
  } as Task;
  void syncNewToNotion(id, created, opts.assigneeNotionUserId, opts.notionProjectId);
  return id;
}

export async function updateTask(
  task: Task,
  patch: Partial<Task>,
  assigneeNotionUserId?: string | null,
  notionProjectId?: string | null,
): Promise<void> {
  // On completion, the work window's end snaps to the actual done day.
  const finalPatch = becameDone(task.status, patch.status)
    ? { ...patch, dueDate: Timestamp.now() }
    : patch;
  const { error } = await supabase.from('tasks').update(taskPatchToRow(finalPatch)).eq('id', task.id);
  if (error) throw error;

  const merged = { ...task, ...finalPatch };
  if (task.notionPageId) void safeNotionUpdate(task.notionPageId, merged, assigneeNotionUserId, notionProjectId);
  // Completion notifications are dispatched by the UI (NotifyContext), not here.
}

export async function moveTask(task: Task, status: TaskStatus, order: number): Promise<void> {
  const finished = becameDone(task.status, status);
  const doneEnd = finished ? { dueDate: Timestamp.now() } : {};
  const { error } = await supabase
    .from('tasks')
    .update(taskPatchToRow({ status, order, ...doneEnd }))
    .eq('id', task.id);
  if (error) throw error;
  if (task.notionPageId) void safeNotionUpdate(task.notionPageId, { ...task, status, ...doneEnd });
}

/**
 * Chuyển task sang sprint khác để sprint mới làm tiếp. Sprint cũ KHÔNG mất dấu vết:
 * trigger `tasks_log_sprint` (migration 0015) tự ghi vào `task_sprints`, nhờ đó đếm được
 * task này đã trễ mấy sprint.
 *
 * Cố ý không đụng `status` (task vẫn dở dang) và không đụng `due_date` (cửa sổ làm việc
 * do người dùng đặt, chuyển sprint không phải lý do để viết lại).
 */
export async function moveTaskToSprint(task: Task, sprintId: string): Promise<void> {
  if (sprintId === task.sprintId) return;
  const { error } = await supabase.from('tasks').update({ sprint_id: sprintId }).eq('id', task.id);
  if (error) throw error;
}

/** True only on the transition into `done` (avoids re-notifying already-done tasks). */
export function becameDone(prev: TaskStatus, next: TaskStatus | undefined): boolean {
  return next === 'done' && prev !== 'done';
}

/**
 * Xoá task, và dọn luôn trang Notion đã liên kết (nếu có).
 *
 * Nhận cả `task` chứ không chỉ id vì cần `notionPageId` — sau khi xoá khỏi Postgres thì
 * không còn chỗ nào tra ra nó nữa.
 *
 * Thứ tự có chủ ý: Postgres trước, Notion sau. Postgres là nguồn sự thật, nên Notion hỏng
 * cũng không được chặn việc xoá; ngược lại archive Notion trước rồi Postgres lỗi thì trang
 * đã vào Trash trong khi task vẫn còn sống — lệch tệ hơn.
 */
export async function deleteTask(task: Pick<Task, 'id' | 'notionPageId'>): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', task.id);
  if (error) throw error;
  if (task.notionPageId) void safeNotionArchive(task.notionPageId);
}

async function syncNewToNotion(
  id: string,
  task: Task,
  assigneeNotionUserId?: string | null,
  notionProjectId?: string | null,
) {
  try {
    const r = await createNotionPage(task, assigneeNotionUserId, notionProjectId);
    if (r.synced && r.notionPageId) {
      await supabase
        .from('tasks')
        .update({ notion_page_id: r.notionPageId, notion_url: r.notionUrl ?? null })
        .eq('id', id);
    }
  } catch (err) {
    console.error('Đồng bộ tạo Notion thất bại (task vẫn đã lưu)', err);
  }
}

async function safeNotionUpdate(
  notionPageId: string,
  task: Task,
  assigneeNotionUserId?: string | null,
  notionProjectId?: string | null,
) {
  try {
    await updateNotionPage(notionPageId, task, assigneeNotionUserId, notionProjectId);
  } catch (err) {
    console.error('Đồng bộ cập nhật Notion thất bại', err);
  }
}

async function safeNotionArchive(notionPageId: string) {
  try {
    await archiveNotionPage(notionPageId);
  } catch (err) {
    // Task đã xoá khỏi Postgres rồi — không có gì để rollback, và cũng không nên: đây là
    // side-sync. Log lại để còn dọn tay trang Notion mồ côi.
    console.error(`Xoá trang Notion ${notionPageId} thất bại (task đã xoá khỏi app)`, err);
  }
}
