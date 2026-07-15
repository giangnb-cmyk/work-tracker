// Bug mutations — Supabase only (no external sync). Kept out of React so any
// view can call them.

import { supabase } from '../supabase';
import { bugPatchToRow } from './mappers';
import type { Bug, BugStatus } from '../types';

export interface NewBugInput {
  projectId: string;
  title: string;
  description: string;
  status: BugStatus;
  labelIds: string[];
  assigneeId: string | null;
  assigneeName: string;
  reporterId: string | null;
  reporterName: string;
}

export async function createBug(input: NewBugInput): Promise<string> {
  const { data, error } = await supabase
    .from('bugs')
    .insert({
      project_id: input.projectId,
      title: input.title.trim(),
      description: input.description.trim(),
      status: input.status,
      label_ids: input.labelIds,
      assignee_id: input.assigneeId,
      assignee_name: input.assigneeName,
      reporter_id: input.reporterId,
      reporter_name: input.reporterName,
      order: Date.now(),
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateBug(id: string, patch: Partial<Bug>): Promise<void> {
  const { error } = await supabase.from('bugs').update(bugPatchToRow(patch)).eq('id', id);
  if (error) throw error;
}

/** Kanban move: change status (and keep a stable order). */
export async function moveBug(id: string, status: BugStatus): Promise<void> {
  const { error } = await supabase.from('bugs').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function deleteBug(id: string): Promise<void> {
  const { error } = await supabase.from('bugs').delete().eq('id', id);
  if (error) throw error;
}
