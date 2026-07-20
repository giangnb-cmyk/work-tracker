// Task write operations — Supabase mutations + best-effort Notion sync.
// Kept out of React so any component can call them. Notion sync is fire-and-forget:
// Postgres is the source of truth if Notion fails.

import { supabase } from '../supabase';
import { reportError } from './errorBus';
import { archiveNotionPage, createNotionPage, updateNotionPage } from './notionSync';
import { taskPatchToRow } from './mappers';
import { endOfWorkWeek, sundayOfWeek } from './format';
import { Timestamp } from './time';
import type { NewTaskInput, Sprint, Task, TaskStatus } from '../types';

interface CreateOpts {
  reporterId: string;
  assigneeName: string;
  assigneeNotionUserId?: string | null;
  notionProjectId?: string | null;
  watcherNames: string[];
}

/**
 * Ngưỡng "tiêu đề quá dài": câu dài kiểu mô tả bug bị cắt một dòng ở list và cả ô tiêu đề
 * chi tiết (input một dòng), đọc không hết.
 */
export const LONG_TITLE_CHARS = 80;

/**
 * Mô tả nên lưu/hiển thị: khi tiêu đề vượt {@link LONG_TITLE_CHARS} mà mô tả CÒN TRỐNG, lấy
 * nguyên tiêu đề làm mô tả để mở chi tiết đọc trọn (ô tiêu đề không xuống dòng được). Mô tả
 * đã có nội dung thì tôn trọng, không đè. Idempotent: seed xong mô tả hết trống nên lần sau
 * không seed lại; và người dùng vẫn xoá được nếu không muốn (không ép ở updateTask).
 */
export function descWithLongTitle(title: string, description: string): string {
  const t = title.trim();
  const d = description.trim();
  return d === '' && t.length > LONG_TITLE_CHARS ? t : d;
}

export async function createTask(input: NewTaskInput, opts: CreateOpts): Promise<string> {
  // Auto due window: starts today, ends Friday of this week (unless a due end was picked).
  const now = new Date();
  const dueStart = Timestamp.fromDate(now);
  const dueDate = Timestamp.fromDate(input.dueDate ?? endOfWorkWeek(now));
  // Tên dài mà chưa có mô tả → chép tiêu đề vào mô tả để đọc được ở chi tiết.
  const description = descWithLongTitle(input.title, input.description);

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title: input.title.trim(),
      description,
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
    description,
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
  // subtask VỪA đổi ở lần lưu này -> mới đồng bộ lại checklist Notion (tránh ghi lại vô ích
  // khi chỉ đổi status/tên/…).
  const subtasksChanged = finalPatch.subtasks !== undefined;
  if (task.notionPageId) {
    void safeNotionUpdate(task.notionPageId, merged, assigneeNotionUserId, notionProjectId, subtasksChanged);
  }
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
 * Hạn chót DỜI theo sprint đích: = chủ nhật của tuần sprint mới (cùng luật tạo task, xem
 * `sundayOfWeek` + TaskModal) — task gánh sang tuần sau thì hạn cũng phải là tuần sau, chứ
 * không giữ hạn của tuần đã qua. Tính từ ngày BẮT ĐẦU sprint để luôn ra chủ nhật kể cả khi
 * end_date lỡ đặt lệch; sprint đích không có ngày nào thì giữ nguyên hạn cũ.
 *
 * KHÔNG dời hạn task đã `done`: dueDate của task done là NGÀY HOÀN THÀNH THẬT (updateTask/
 * moveTask ghi vào), báo cáo hiệu suất đọc nó — ghi đè thành chủ nhật tương lai là hỏng số.
 * Cũng không đụng `status` (task vẫn dở dang).
 */
export async function moveTaskToSprint(task: Task, sprint: Sprint): Promise<void> {
  if (sprint.id === task.sprintId) return;
  const anchor = sprint.startDate?.toDate() ?? sprint.endDate?.toDate() ?? null;
  const patch: Record<string, unknown> = { sprint_id: sprint.id };
  if (anchor && task.status !== 'done') {
    patch.due_date = Timestamp.fromDate(sundayOfWeek(anchor)).toISOString();
  }
  const { error } = await supabase.from('tasks').update(patch).eq('id', task.id);
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

/**
 * Tạo trang Notion cho một task ĐÃ tồn tại — nút "Sync Notion" ở task chi tiết.
 *
 * KHÁC `syncNewToNotion` ở một điểm quan trọng: hàm này **không nuốt lỗi**. Lúc tạo task,
 * Notion hỏng mà im lặng là đúng (Postgres là nguồn sự thật, đừng chặn việc tạo task).
 * Nhưng khi người dùng CHỦ ĐỘNG bấm nút, im lặng là tệ nhất — họ bấm xong không thấy gì
 * và không biết vì sao. Ném lỗi để modal hiện ra.
 */
export async function syncTaskToNotion(
  task: Task,
  assigneeNotionUserId?: string | null,
  notionProjectId?: string | null,
): Promise<{ notionPageId: string; notionUrl: string }> {
  if (task.notionPageId) throw new Error('Task này đã có trang Notion rồi.');
  const r = await createNotionPage(task, assigneeNotionUserId, notionProjectId);
  if (!r.synced || !r.notionPageId) {
    throw new Error(
      r.reason === 'notion_not_configured'
        ? 'Server chưa cấu hình Notion (thiếu NOTION_TOKEN / NOTION_DATABASE_ID).'
        : `Notion không nhận task này (${r.reason ?? 'không rõ lý do'}).`,
    );
  }
  const { error } = await supabase
    .from('tasks')
    .update({ notion_page_id: r.notionPageId, notion_url: r.notionUrl ?? null })
    .eq('id', task.id);
  if (error) throw error;
  return { notionPageId: r.notionPageId, notionUrl: r.notionUrl ?? '' };
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
    // Fire-and-forget theo nghĩa "không chặn việc tạo task", KHÔNG phải "im như không có
    // gì". Nuốt hẳn vào console thì cú sync hỏng là vô hình: task nằm im ngoài Notion và
    // người tạo chỉ phát hiện khi tình cờ thấy nút "Tạo task trên Notion" hiện ra.
    reportError('Notion · tạo task', err, 'Task vẫn đã lưu. Mở task rồi bấm “Tạo task trên Notion” để thử lại.');
  }
}

async function safeNotionUpdate(
  notionPageId: string,
  task: Task,
  assigneeNotionUserId?: string | null,
  notionProjectId?: string | null,
  subtasksChanged = false,
) {
  try {
    await updateNotionPage(notionPageId, task, assigneeNotionUserId, notionProjectId, subtasksChanged);
  } catch (err) {
    reportError('Notion · cập nhật', err, 'Thay đổi vẫn đã lưu trong app; chỉ trang Notion là chưa theo kịp.');
  }
}

async function safeNotionArchive(notionPageId: string) {
  try {
    await archiveNotionPage(notionPageId);
  } catch (err) {
    // Task đã xoá khỏi Postgres rồi — không có gì để rollback, và cũng không nên: đây là
    // side-sync. Nhưng nó để lại một trang Notion MỒ CÔI phải dọn tay, nên kèm luôn id
    // vào nhật ký: chôn trong console thì không ai biết mà đi dọn.
    reportError('Notion · xoá task', err, `Task đã xoá khỏi app. Trang Notion ${notionPageId} còn sót lại, cần xoá tay.`);
  }
}
