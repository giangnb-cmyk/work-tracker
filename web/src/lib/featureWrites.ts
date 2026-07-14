// Admin-only feature writes. RLS requires admin. A feature belongs to a project.

import { supabase } from '../supabase';
import type { Feature } from '../types';

export interface FeatureInput {
  projectId: string;
  name: string;
  icon: string;
  color: string;
  description: string;
}

export async function createFeature(input: FeatureInput, createdBy: string): Promise<string> {
  const { data, error } = await supabase
    .from('features')
    .insert({
      project_id: input.projectId,
      name: input.name.trim(),
      icon: input.icon || '🧩',
      color: input.color || '#6366f1',
      description: input.description.trim(),
      created_by: createdBy || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateFeature(id: string, patch: Partial<Feature>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.icon !== undefined) row.icon = patch.icon;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.description !== undefined) row.description = patch.description;
  const { error } = await supabase.from('features').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteFeature(id: string): Promise<void> {
  const { error } = await supabase.from('features').delete().eq('id', id);
  if (error) throw error;
}
