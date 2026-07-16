// Admin-only bug-label (tag palette) writes. RLS requires admin.

import { supabase } from '../supabase';
import type { BugLabel } from '../types';

export interface BugLabelInput {
  projectId: string;
  name: string;
  color: string;
  icon: string;
}

export async function createBugLabel(input: BugLabelInput, createdBy: string): Promise<string> {
  const { data, error } = await supabase
    .from('bug_labels')
    .insert({
      project_id: input.projectId,
      name: input.name.trim(),
      color: input.color || '#6366f1',
      icon: input.icon || '',
      created_by: createdBy || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateBugLabel(id: string, patch: Partial<BugLabel>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.icon !== undefined) row.icon = patch.icon;
  const { error } = await supabase.from('bug_labels').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteBugLabel(id: string): Promise<void> {
  const { error } = await supabase.from('bug_labels').delete().eq('id', id);
  if (error) throw error;
}

/** The default palette from the design (Bug / severities / workflow / triage). */
const DEFAULT_LABELS: Omit<BugLabelInput, 'projectId'>[] = [
  { name: 'Bug', color: '#a855f7', icon: '🐞' },
  { name: 'High', color: '#ef4444', icon: '🔴' },
  { name: 'Medium', color: '#f59e0b', icon: '🟠' },
  { name: 'Low', color: '#eab308', icon: '🟡' },
  { name: 'Fixing', color: '#fb923c', icon: '🔧' },
  { name: 'Deployed', color: '#6366f1', icon: '🚀' },
  { name: 'Done', color: '#22c55e', icon: '✅' },
  { name: 'Re-open', color: '#f472b6', icon: '🔁' },
  { name: 'Pending', color: '#94a3b8', icon: '⏸️' },
  { name: 'NAB', color: '#64748b', icon: '🚫' },
  { name: 'CNR', color: '#64748b', icon: '❔' },
  { name: 'Performance', color: '#10b981', icon: '📈' },
  { name: 'Visual', color: '#38bdf8', icon: '👁️' },
  { name: 'Logic', color: '#a78bfa', icon: '⚙️' },
  { name: 'Improve', color: '#84cc16', icon: '✏️' },
  { name: 'Unity', color: '#6d28d9', icon: '🎮' },
  { name: 'iOS', color: '#38bdf8', icon: '🍎' },
  { name: 'Android', color: '#22c55e', icon: '🤖' },
];

/** One-tap seed of the standard palette for a project that has no labels yet. */
export async function seedDefaultBugLabels(projectId: string, createdBy: string): Promise<void> {
  const rows = DEFAULT_LABELS.map((l) => ({
    project_id: projectId,
    name: l.name,
    color: l.color,
    icon: l.icon,
    created_by: createdBy || null,
  }));
  const { error } = await supabase.from('bug_labels').insert(rows);
  if (error) throw error;
}
