// Task write operations — Supabase mutations + best-effort Notion sync.
// Kept out of React so any component can call them. Notion sync is fire-and-forget:
// Postgres is the source of truth if Notion fails.

import { supabase } from '../supabase';
import { createNotionPage, updateNotionPage } from './notionSync';
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

/** True only on the transition into `done` (avoids re-notifying already-done tasks). */
export function becameDone(prev: TaskStatus, next: TaskStatus | undefined): boolean {
  return next === 'done' && prev !== 'done';
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
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
    console.error('Notion create sync failed (task saved anyway)', err);
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
    console.error('Notion update sync failed', err);
  }
}
