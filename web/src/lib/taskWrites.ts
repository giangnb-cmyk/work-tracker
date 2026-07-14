// Task write operations — plain Firestore mutations + best-effort Notion sync.
// Kept out of React so any component can call them without extra listeners.
// Notion sync is fire-and-forget: Firestore is the source of truth if Notion fails.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { createNotionPage, updateNotionPage } from './notionSync';
import { notifyTaskDone } from './discordNotify';
import type { NewTaskInput, Task, TaskStatus } from '../types';

interface CreateOpts {
  reporterId: string;
  assigneeName: string;
  assigneeNotionUserId?: string | null;
}

export async function createTask(input: NewTaskInput, opts: CreateOpts): Promise<string> {
  const ref = await addDoc(collection(db, 'tasks'), {
    title: input.title.trim(),
    description: input.description.trim(),
    sprintId: input.sprintId,
    status: input.status,
    priority: input.priority,
    assigneeId: input.assigneeId,
    assigneeName: opts.assigneeName,
    reporterId: opts.reporterId,
    points: input.points,
    tags: [],
    dueDate: input.dueDate ? Timestamp.fromDate(input.dueDate) : null,
    order: Date.now(), // monotonic-ish default; drag-drop rewrites this
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    source: 'web',
    notionPageId: null,
    notionUrl: null,
  });
  await updateDoc(ref, { id: ref.id });

  const created = {
    id: ref.id,
    title: input.title,
    description: input.description,
    status: input.status,
    priority: input.priority,
    assigneeName: opts.assigneeName,
    dueDate: input.dueDate ? Timestamp.fromDate(input.dueDate) : null,
  } as Task;
  void syncNewToNotion(ref.id, created, opts.assigneeNotionUserId);
  return ref.id;
}

export async function updateTask(
  task: Task,
  patch: Partial<Task>,
  assigneeNotionUserId?: string | null,
  sprintName?: string,
): Promise<void> {
  await updateDoc(doc(db, 'tasks', task.id), { ...patch, updatedAt: serverTimestamp() });
  const merged = { ...task, ...patch };
  if (task.notionPageId) {
    void safeNotionUpdate(task.notionPageId, merged, assigneeNotionUserId);
  }
  if (becameDone(task.status, merged.status)) void notifyTaskDone(merged, sprintName);
}

export async function moveTask(
  task: Task,
  status: TaskStatus,
  order: number,
  sprintName?: string,
): Promise<void> {
  await updateDoc(doc(db, 'tasks', task.id), { status, order, updatedAt: serverTimestamp() });
  if (task.notionPageId) {
    void safeNotionUpdate(task.notionPageId, { ...task, status });
  }
  if (becameDone(task.status, status)) void notifyTaskDone({ ...task, status }, sprintName);
}

/** True only on the transition into `done` (avoids re-notifying already-done tasks). */
function becameDone(prev: TaskStatus, next: TaskStatus | undefined): boolean {
  return next === 'done' && prev !== 'done';
}

export function deleteTask(id: string): Promise<void> {
  return deleteDoc(doc(db, 'tasks', id));
}

async function syncNewToNotion(id: string, task: Task, assigneeNotionUserId?: string | null) {
  try {
    const r = await createNotionPage(task, assigneeNotionUserId);
    if (r.synced && r.notionPageId) {
      await updateDoc(doc(db, 'tasks', id), {
        notionPageId: r.notionPageId,
        notionUrl: r.notionUrl ?? null,
      });
    }
  } catch (err) {
    console.error('Notion create sync failed (task saved to Firestore anyway)', err);
  }
}

async function safeNotionUpdate(
  notionPageId: string,
  task: Task,
  assigneeNotionUserId?: string | null,
) {
  try {
    await updateNotionPage(notionPageId, task, assigneeNotionUserId);
  } catch (err) {
    console.error('Notion update sync failed', err);
  }
}
