// Ghép note họp từ task đã gom theo bộ phận. Thuần — không React, không clipboard.

import type { DeptTaskGroup } from './taskGrouping';

/** Task đã xong có được liệt kê không. Note họp tuần thường chỉ quan tâm việc còn lại. */
export type NoteScope = 'all' | 'open';

/**
 * Dạng Markdown mà cả Discord lẫn Notion đều render được:
 *
 *   ## Sprint 3
 *   ### 🎨 2D Artist
 *   - Tách npc 4, 5, 6, 7 v3
 *
 * Cố ý KHÔNG dùng bảng: Discord không render bảng (xem FORMAT_HINT của bot).
 * Bộ phận nào không còn task nào sau khi lọc thì bỏ hẳn mục, không để tiêu đề trống.
 */
export function buildMeetingNote(title: string, groups: DeptTaskGroup[], scope: NoteScope = 'all'): string {
  const lines: string[] = [`## ${title}`, ''];

  for (const group of groups) {
    const tasks = scope === 'open' ? group.tasks.filter((t) => t.status !== 'done') : group.tasks;
    if (tasks.length === 0) continue;
    lines.push(`### ${group.icon} ${group.label}`);
    for (const task of tasks) lines.push(`- ${task.title}`);
    lines.push('');
  }

  // Chỉ có tiêu đề = không có việc nào lọt bộ lọc.
  if (lines.length <= 2) return `## ${title}\n\n_Không có task nào._`;
  return lines.join('\n').trimEnd();
}
