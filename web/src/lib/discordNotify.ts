// Client for the /api/notify-discord gateway. Fire-and-forget from the UI.
// Looks up the involved members' Discord ids, then asks the server to post.

import { supabase } from '../supabase';
import type { Task } from '../types';

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
        mentionIds,
      }),
    });
  } catch (err) {
    console.error('Thông báo Discord thất bại', err);
  }
}
