// Nhân bản task / feature. Tách khỏi taskWrites + featureWrites vì đây là một việc riêng
// (và hai file kia đã dài): "chép một thứ đã có thành một thứ mới, sạch trạng thái".
//
// Luật chung cho MỌI bản sao — chép NỘI DUNG, bỏ TIẾN ĐỘ:
//   - status -> 'todo', subtask -> chưa tick, feature -> chưa xong
//   - id của subtask/attachment sinh MỚI (id cũ là khoá trong mảng jsonb; `toggle_my_subtask`
//     tra theo cặp task_id + subtask_id nên trùng id giữa hai task không sai, nhưng trùng
//     rồi thì mọi thứ dò theo id sau này đều mơ hồ)
//   - KHÔNG chép notionPageId/notionUrl/shortCode/lịch sử: bản sao là một thứ khác, có
//     trang Notion và mã ngắn của riêng nó.

import { supabase } from '../supabase';
import { createTask, type CreateOpts } from './taskWrites';
import { createFeature, deleteFeature } from './featureWrites';
import { rowToTask } from './mappers';
import type { Attachment, Feature, NewTaskInput, Subtask, Task } from '../types';

/** `check (char_length(title) between 1 and 140)` — migration 0001. Vượt là insert bị chặn. */
const TITLE_MAX = 140;
const COPY_SUFFIX = ' (bản sao)';

/**
 * Tên cho bản sao, CẮT cho vừa giới hạn 140 ký tự của DB.
 *
 * Không cắt thì task tên dài (mô tả bug dán nguyên câu) nhân bản là dính lỗi CHECK của
 * Postgres — báo về UI thành "Nhân bản thất bại" chẳng rõ vì sao.
 */
export function copyTitle(title: string): string {
  const base = title.trim();
  const room = TITLE_MAX - COPY_SUFFIX.length;
  return (base.length <= room ? base : base.slice(0, room).trimEnd()) + COPY_SUFFIX;
}

/** Subtask của bản sao: giữ tên + người làm, id mới, và CHƯA tick. */
export function copySubtasks(subtasks: Subtask[] | undefined): Subtask[] {
  return (subtasks ?? []).map((s) => ({ ...s, id: crypto.randomUUID(), done: false }));
}

/**
 * Attachment của bản sao: id mới, nhưng `url`/`storagePath` TRỎ CHUNG file gốc trên Storage.
 *
 * Cố ý không tải lên bản thứ hai: gói Supabase đang dùng chỉ 1 GB (xem `bug_mirror_videos`
 * trong bot/settings.json), nhân đôi ảnh ref mỗi lần duplicate là đốt quota vô ích. An
 * toàn vì hiện KHÔNG có đường nào xoá file storage — `deleteAttachmentFile` trong
 * attachments.ts chưa có ai gọi, gỡ ảnh khỏi task chỉ bỏ nó khỏi mảng jsonb.
 * NẾU sau này nối `deleteAttachmentFile` vào nút gỡ ảnh thì PHẢI đếm tham chiếu trước,
 * không thì xoá ảnh ở bản sao sẽ làm thủng ảnh của bản gốc.
 */
export function copyAttachments(attachments: Attachment[] | undefined): Attachment[] {
  return (attachments ?? []).map((a) => ({ ...a, id: crypto.randomUUID() }));
}

/** Task gốc -> payload tạo task mới. Thuần tuý, không đụng mạng — dễ soi và dễ test. */
export function taskCopyInput(task: Task): NewTaskInput {
  return {
    title: copyTitle(task.title),
    description: task.description,
    // GIỮ sprint: nhân bản một task đang mở nghĩa là "cho tôi thêm một cái như vầy, ở đây".
    sprintId: task.sprintId,
    projectId: task.projectId,
    featureId: task.featureId,
    status: 'todo',
    priority: task.priority,
    points: task.points,
    assigneeId: task.assigneeId,
    // Task đã done thì `dueDate` của nó là NGÀY HOÀN THÀNH THẬT (xem DATA_MODEL), chép sang
    // bản sao là ra một task mới toanh mà hạn nằm trong quá khứ -> trễ hạn ảo. Bỏ trống để
    // createTask tự tính hạn theo sprint.
    dueDate: task.status === 'done' ? null : (task.dueDate?.toDate() ?? null),
    attachments: copyAttachments(task.attachments),
    subtasks: copySubtasks(task.subtasks),
    watcherIds: [...(task.watcherIds ?? [])],
  };
}

/** Cùng bộ tuỳ chọn với `createTask` — bản sao đi đúng đường tạo task bình thường. */
type DuplicateTaskOpts = CreateOpts;

/**
 * Nhân bản MỘT task (kèm subtask). Đi qua `createTask` nên bản sao cũng được đẩy sang
 * Notion + báo Discord y như một task tạo tay — đúng vậy, vì với cả đội thì đây LÀ một
 * task mới xuất hiện.
 */
export async function duplicateTask(task: Task, opts: DuplicateTaskOpts): Promise<string> {
  return createTask(taskCopyInput(task), opts);
}

/** Mọi task đang gắn vào một feature — dùng cho màn xác nhận lẫn lúc chép thật. */
export async function fetchFeatureTasks(featureId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('feature_id', featureId)
    .order('order', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToTask);
}

/**
 * Hàng `tasks` cho bản sao trong feature MỚI.
 *
 * Khác `taskCopyInput` ở hai chỗ, đều có chủ đích:
 *  - GIỮ NGUYÊN tên, không thêm "(bản sao)": tên feature đã phân biệt rồi ("Map 2" →
 *    "Dựng tileset"), gắn thêm hậu tố chỉ làm bẩn cả rổ task.
 *  - Về BACKLOG (`sprint_id = null`, không hạn): sao chép cả feature là việc LẬP KẾ HOẠCH
 *    cho một hạng mục sắp tới; nhét thẳng vào sprint đang chạy là làm phồng sprint và đẻ
 *    ra một đống task trễ hạn ảo. Kéo vào sprint lúc nào là quyết định riêng.
 */
function featureTaskRow(task: Task, featureId: string, reporterId: string, order: number) {
  return {
    title: task.title.trim(),
    description: task.description,
    sprint_id: null,
    project_id: task.projectId,
    feature_id: featureId,
    status: 'todo',
    priority: task.priority,
    assignee_id: task.assigneeId,
    assignee_name: task.assigneeName,
    reporter_id: reporterId || null,
    points: task.points,
    due_start: new Date().toISOString(),
    due_date: null,
    order,
    source: 'web',
    attachments: copyAttachments(task.attachments),
    subtasks: copySubtasks(task.subtasks),
    watcher_ids: [...(task.watcherIds ?? [])],
    watcher_names: [...(task.watcherNames ?? [])],
  };
}

export interface DuplicateFeatureResult {
  featureId: string;
  taskCount: number;
}

/**
 * Nhân bản một feature kèm TOÀN BỘ task bên trong — "Map 1" -> "Map 2" mà không phải gõ
 * lại từng task y hệt.
 *
 * Task được chép bằng MỘT lệnh insert mảng, cố ý KHÔNG đi qua `createTask`: làm thế thì
 * mỗi task đẻ một trang Notion + một tin Discord, chép feature 12 task là 12 tin nhắn dội
 * vào kênh. Bản sao sync Notion sau bằng nút "Sync Notion" ở từng task khi thật sự cần.
 */
export async function duplicateFeature(
  source: Feature,
  newName: string,
  tasks: Task[],
  createdBy: string,
): Promise<DuplicateFeatureResult> {
  const featureId = await createFeature(
    {
      projectId: source.projectId,
      name: newName.trim(),
      icon: source.icon,
      color: source.color,
      description: source.description,
      kind: source.kind,
      labelIds: [...(source.labelIds ?? [])],
      attachments: copyAttachments(source.attachments),
      memberIds: [...(source.memberIds ?? [])],
      done: false,
    },
    createdBy,
  );

  if (tasks.length === 0) return { featureId, taskCount: 0 };

  // `order` tăng dần theo thứ tự gốc để bản sao xếp đúng như bản gốc (order nhỏ = lên trước).
  const base = Date.now();
  const rows = tasks.map((t, i) => featureTaskRow(t, featureId, createdBy, base + i));
  const { error } = await supabase.from('tasks').insert(rows);
  if (error) {
    // Hai lệnh ghi qua REST không nằm chung transaction được. Chép task hỏng mà để lại cái
    // feature rỗng thì người dùng bấm lại là có HAI "Map 2" — dọn ngay, best-effort.
    void deleteFeature(featureId).catch((e) => console.error('Dọn feature rỗng thất bại', e));
    throw error;
  }
  return { featureId, taskCount: rows.length };
}
