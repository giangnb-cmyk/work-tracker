// Ghép note họp từ task đã gom theo bộ phận. Thuần — không React, không clipboard.

import type { DeptTaskGroup } from './taskGrouping';
import type { Task } from '../types';

/** Task đã xong có được liệt kê không. Note họp tuần thường chỉ quan tâm việc còn lại. */
export type NoteScope = 'all' | 'open';

/** Dựng URL mở task (vd base + /tasks/<id>?p=…). Tách ra để lib thuần, không dính router. */
export type TaskLinkBuilder = (task: Task) => string;

/** Task lọt bộ lọc của 1 bộ phận. 'open' = bỏ task đã done (note tuần lo việc còn lại). */
function scopedTasks(group: DeptTaskGroup, scope: NoteScope): Task[] {
  return scope === 'open' ? group.tasks.filter((t) => t.status !== 'done') : group.tasks;
}

/**
 * '[' / ']' trong tiêu đề cắt sớm cú pháp link `[nhãn](url)` (không có cách escape ổn định
 * trong nhãn masked link của Discord) -> đổi sang ngoặc tròn cho link không vỡ.
 */
function linkLabel(title: string): string {
  return title.replace(/[[\]]/g, (c) => (c === '[' ? '(' : ')'));
}

/**
 * Các dòng bullet cho 1 danh sách task, kèm subtask thụt vào 2 dấu cách (cả Discord lẫn
 * Notion đều hiểu là bậc con).
 *
 * linkFor (tuỳ chọn): có thì mỗi TASK là masked link `[tiêu đề](url)` — bấm ở Discord mở
 * thẳng task trên web. Discord NAY đã render masked link ngay trong tin người dùng gõ/dán
 * (không còn giới hạn ở embed). Subtask KHÔNG kèm link (checklist con, không có deep link).
 *
 * Subtask cùng bộ lọc với task: 'open' chỉ liệt subtask CHƯA xong (việc còn lại để bàn);
 * 'all' liệt hết, việc đã xong gạch ngang (~~…~~) để thấy tiến độ.
 */
function taskLines(tasks: Task[], scope: NoteScope, linkFor?: TaskLinkBuilder): string[] {
  const out: string[] = [];
  for (const task of tasks) {
    out.push(linkFor ? `- [${linkLabel(task.title)}](${linkFor(task)})` : `- ${task.title}`);
    const subs = scope === 'open' ? task.subtasks.filter((s) => !s.done) : task.subtasks;
    for (const sub of subs) out.push(`  - ${sub.done ? `~~${sub.title}~~` : sub.title}`);
  }
  return out;
}

/**
 * Note họp CẢ SPRINT dạng Markdown mà cả Discord lẫn Notion đều render được:
 *
 *   ## Sprint 3
 *   ### 🎨 2D Artist
 *   - [Tách npc 4, 5, 6, 7 v3](https://…/tasks/<id>?p=<proj>)
 *     - Phác thảo
 *     - ~~Tô màu~~
 *
 * Cố ý KHÔNG dùng bảng: Discord không render bảng (xem FORMAT_HINT của bot).
 * Bộ phận nào không còn task nào sau khi lọc thì bỏ hẳn mục, không để tiêu đề trống.
 */
export function buildMeetingNote(
  title: string,
  groups: DeptTaskGroup[],
  scope: NoteScope = 'all',
  linkFor?: TaskLinkBuilder,
): string {
  const lines: string[] = [`## ${title}`, ''];

  for (const group of groups) {
    const tasks = scopedTasks(group, scope);
    if (tasks.length === 0) continue;
    lines.push(`### ${group.icon} ${group.label}`, ...taskLines(tasks, scope, linkFor), '');
  }

  // Chỉ có tiêu đề = không có việc nào lọt bộ lọc.
  if (lines.length <= 2) return `## ${title}\n\n_Không có task nào._`;
  return lines.join('\n').trimEnd();
}

/** Một khúc note cho 1 bộ phận — copy riêng để mỗi tin Discord < giới hạn ký tự. */
export interface DeptNote {
  key: string;
  icon: string;
  label: string;
  taskCount: number;
  text: string;
}

/**
 * Cắt note thành TỪNG BỘ PHẬN. Mỗi khúc tự đủ context (`## <title> — <icon> <label>`) để
 * dán làm 1 tin Discord riêng — né trần 2000 ký tự khi copy cả note quá dài. Chỉ trả bộ
 * phận còn task sau khi lọc; cùng thứ tự và cùng cách render với buildMeetingNote.
 */
export function buildDeptNotes(
  title: string,
  groups: DeptTaskGroup[],
  scope: NoteScope = 'all',
  linkFor?: TaskLinkBuilder,
): DeptNote[] {
  const out: DeptNote[] = [];
  for (const group of groups) {
    const tasks = scopedTasks(group, scope);
    if (tasks.length === 0) continue;
    const text = [`## ${title} — ${group.icon} ${group.label}`, '', ...taskLines(tasks, scope, linkFor)]
      .join('\n')
      .trimEnd();
    out.push({ key: group.key, icon: group.icon, label: group.label, taskCount: tasks.length, text });
  }
  return out;
}
