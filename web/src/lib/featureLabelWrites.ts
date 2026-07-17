// Admin-only feature-label (tag palette) writes. RLS requires admin.
// Cùng pattern với bugLabelWrites — palette riêng cho tab Features.

import { supabase } from '../supabase';
import type { FeatureLabel } from '../types';

export interface FeatureLabelInput {
  projectId: string;
  name: string;
  color: string;
  icon: string;
}

export async function createFeatureLabel(input: FeatureLabelInput, createdBy: string): Promise<string> {
  const { data, error } = await supabase
    .from('feature_labels')
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

export async function updateFeatureLabel(id: string, patch: Partial<FeatureLabel>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.icon !== undefined) row.icon = patch.icon;
  // Ngày release của nhãn version (0032). Gửi dạng 'YYYY-MM-DD' — cột là `date`, nhét
  // cả giờ vào là Postgres tự cắt, lệch múi giờ thì lệch luôn một ngày.
  if (patch.releaseDate !== undefined) {
    row.release_date = patch.releaseDate ? patch.releaseDate.toDate().toISOString().slice(0, 10) : null;
  }
  const { error } = await supabase.from('feature_labels').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteFeatureLabel(id: string): Promise<void> {
  const { error } = await supabase.from('feature_labels').delete().eq('id', id);
  if (error) throw error;
}
