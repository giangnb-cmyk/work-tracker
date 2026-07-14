// In-app "web" notifications: one row per recipient in `notifications`, delivered live
// to each user's app via useNotifications. The web half of the completion notice
// (Discord is the other half — see discordNotify.ts).

import { supabase } from '../supabase';
import type { Task } from '../types';

/** Everyone tied to the task (assignee, reporter, watchers) except the actor. */
function recipientsFor(task: Task, actorUid: string): string[] {
  const ids = [task.assigneeId, task.reporterId, ...(task.watcherIds ?? [])];
  return [...new Set(ids.filter((id): id is string => Boolean(id) && id !== actorUid))];
}

/** Create a "task done" notification for each related user. Best-effort. */
export async function createDoneNotifications(
  task: Task,
  actorUid: string,
  actorName: string,
): Promise<number> {
  const recipients = recipientsFor(task, actorUid);
  if (recipients.length === 0) return 0;

  const rows = recipients.map((recipient_id) => ({
    recipient_id,
    task_id: task.id,
    task_title: task.title,
    type: 'task_done',
    body: `${actorName} đã hoàn thành task "${task.title}".`,
    actor_name: actorName,
    read: false,
  }));
  const { error } = await supabase.from('notifications').insert(rows);
  if (error) throw error;
  return recipients.length;
}

/** Mark the given notifications read. No-op on empty input. */
export async function markNotificationsRead(ids: string[]): Promise<void> {
  const clean = ids.filter(Boolean);
  if (clean.length === 0) return;
  const { error } = await supabase.from('notifications').update({ read: true }).in('id', clean);
  if (error) throw error;
}
