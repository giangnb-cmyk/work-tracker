// Ghi chart Gantt tốc độ (`velocity_charts`, migration 0085). Tách khỏi React để modal
// và bất kỳ chỗ nào khác dùng chung một đường ghi.

import { supabase } from '../supabase';
import { velocityChartInputToRow } from './mappers';
import type { VelocityChartInput } from '../types';

export async function createVelocityChart(
  projectId: string,
  input: VelocityChartInput,
  createdBy: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('velocity_charts')
    // created_by PHẢI là chính người gọi — RLS velocity_charts_insert chốt điều kiện này.
    .insert({ project_id: projectId, created_by: createdBy, ...velocityChartInputToRow(input) })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateVelocityChart(id: string, input: VelocityChartInput): Promise<void> {
  const { error } = await supabase
    .from('velocity_charts')
    .update(velocityChartInputToRow(input))
    .eq('id', id);
  if (error) throw error;
}

export async function deleteVelocityChart(id: string): Promise<void> {
  const { error } = await supabase.from('velocity_charts').delete().eq('id', id);
  if (error) throw error;
}
