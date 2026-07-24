// Client for the /api/notify-discord gateway. Fire-and-forget from the UI.
// Looks up the involved members' Discord ids, then asks the server to post.

import { supabase } from '../supabase';
import { taskShareUrl, taskPath, APP_BASE_URL } from './router';
import { PRIORITY_LABEL } from '../types';
import type { Task, TaskPriority } from '../types';
import type { Timestamp } from './time';

async function discordIdOf(uid: string | null | undefined): Promise<string | null> {
  if (!uid) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('discord_id')
    .eq('id', uid)
    .maybeSingle();
  if (error || !data) return null;
  return data.discord_id ?? null;
}

/**
 * Notify Discord that a task is done, mentioning its assignee, reporter, and watchers.
 * Best-effort: any failure is logged and swallowed (never blocks the status change).
 */
export async function notifyTaskDone(task: Task, sprintName?: string): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;

    const watcherIds = task.watcherIds ?? [];
    const ids = await Promise.all([
      discordIdOf(task.assigneeId),
      discordIdOf(task.reporterId),
      ...watcherIds.map((uid) => discordIdOf(uid)),
    ]);
    const mentionIds = [...new Set(ids.filter(Boolean))] as string[];

    await fetch('/api/notify-discord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: task.title,
        sprintName,
        assigneeName: task.assigneeName,
        // Link ĐẦY ĐỦ /tasks/<id>?p=<projectId> trên domain chính tắc — mở đúng dự án khi
        // bấm từ Discord. Masked link `[tên](url)` trong nội dung tin (không phải short link).
        url: `${APP_BASE_URL}${taskPath(task.id, task.projectId)}`,
        mentionIds,
      }),
    });
  } catch (err) {
    console.error('Thông báo Discord thất bại', err);
  }
}

/** Dữ liệu tối thiểu để báo "task mới" — createTask có sẵn id + các field này. */
export interface CreatedInfo {
  taskId: string;
  /** Mã ngắn DB sinh — dựng link rút gọn `/t/<code>`. Chưa có thì lùi về `/tasks/<id>`. */
  shortCode: string | null;
  title: string;
  assigneeId: string | null;
  assigneeName: string;
  reporterId: string;
  projectId: string | null;
  featureId: string | null;
  sprintId: string | null;
  priority: TaskPriority;
  dueDate: Timestamp | null;
}

/** Tên của một hàng theo id (dùng chung cho projects/features/sprints). */
async function nameOf(table: 'projects' | 'features' | 'sprints', id: string | null): Promise<string | undefined> {
  if (!id) return undefined;
  const { data } = await supabase.from(table).select('name').eq('id', id).maybeSingle();
  return data?.name ?? undefined;
}

/**
 * Báo Discord (qua webhook, /api/notify-discord) rằng vừa có task mới, ping người được giao
 * nếu họ đã liên kết Discord id. Best-effort: mọi lỗi chỉ log, không chặn việc tạo task.
 */
export async function notifyTaskCreated(info: CreatedInfo): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;

    // Một query cho cả người tạo + người nhận (tên hiển thị + discord id để ping).
    const ids = [...new Set([info.reporterId, info.assigneeId].filter(Boolean))] as string[];
    const profById = new Map<string, { display_name: string | null; discord_id: string | null }>();
    if (ids.length) {
      const { data } = await supabase.from('profiles').select('id, display_name, discord_id').in('id', ids);
      for (const p of data ?? []) profById.set(p.id, p);
    }
    const creatorName = info.reporterId ? profById.get(info.reporterId)?.display_name ?? undefined : undefined;
    const assigneeDiscordId = info.assigneeId ? profById.get(info.assigneeId)?.discord_id ?? null : null;

    const [projectName, featureName, sprintName] = await Promise.all([
      nameOf('projects', info.projectId),
      nameOf('features', info.featureId),
      nameOf('sprints', info.sprintId),
    ]);

    const due = info.dueDate?.toDate() ?? null;
    const dueLabel = due ? `${due.getDate()}/${due.getMonth() + 1}` : undefined;

    await fetch('/api/notify-discord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        event: 'created',
        title: info.title,
        creatorName,
        assigneeName: info.assigneeName,
        projectName,
        featureName,
        sprintName,
        priorityLabel: PRIORITY_LABEL[info.priority],
        dueLabel,
        // Link RÚT GỌN trên domain chính tắc (không phải origin hiện tại) — xem taskShareUrl.
        url: taskShareUrl(info.shortCode, info.taskId),
        mentionIds: assigneeDiscordId ? [assigneeDiscordId] : [],
      }),
    });
  } catch (err) {
    console.error('Thông báo Discord (task mới) thất bại', err);
  }
}
