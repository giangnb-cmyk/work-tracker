// Ghi nhật ký tiến độ của chart Gantt (`velocity_chart_progress`, migration 0086).
// Trigger DB tự đồng bộ mục mới nhất vào velocity_charts.done_qty — client không ghi cột đó.

import { supabase } from '../supabase';

/** Ghi "tới hết `day` đã xong cộng dồn `doneQty`". Ghi lại cùng ngày = sửa số (khoá chart_id + day). */
export async function logProgress(chartId: string, day: string, doneQty: number, createdBy: string): Promise<void> {
  const { error } = await supabase
    .from('velocity_chart_progress')
    .upsert({ chart_id: chartId, day, done_qty: doneQty, created_by: createdBy }, { onConflict: 'chart_id,day' });
  if (error) throw error;
}

export async function deleteProgress(chartId: string, day: string): Promise<void> {
  const { error } = await supabase
    .from('velocity_chart_progress')
    .delete()
    .eq('chart_id', chartId)
    .eq('day', day);
  if (error) throw error;
}
