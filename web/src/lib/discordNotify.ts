// Client for the /api/notify-discord gateway. Fire-and-forget from the UI.
// Looks up the involved members' Discord ids, then asks the server to post.

import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { Task, TeamMember } from '../types';

async function discordIdOf(uid: string | null | undefined): Promise<string | null> {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? ((snap.data() as TeamMember).discordId ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Notify Discord that a task is done, mentioning its assignee and reporter.
 * Best-effort: any failure is logged and swallowed (never blocks the status change).
 */
export async function notifyTaskDone(task: Task, sprintName?: string): Promise<void> {
  try {
    const token = await auth.currentUser?.getIdToken();
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
    console.error('Discord notify failed', err);
  }
}
