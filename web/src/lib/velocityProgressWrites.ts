// Ghi nhật ký tiến độ của chart Gantt (`velocity_chart_progress`, migration 0086/0089).
// Mỗi mục = số làm được TRONG ngày; trigger DB đồng bộ SUM vào velocity_charts.done_qty —
// client không ghi cột đó.

import { supabase } from '../supabase';

/** Ghi "ngày `day` làm được `qty`". Ghi lại cùng ngày = sửa số của ngày đó (khoá chart_id + day). */
export async function logProgress(chartId: string, day: string, qty: number, createdBy: string): Promise<void> {
  const { error } = await supabase
    .from('velocity_chart_progress')
    .upsert({ chart_id: chartId, day, done_qty: qty, created_by: createdBy }, { onConflict: 'chart_id,day' });
  if (error) throw error;
}

/**
 * Đặt TỔNG đã làm = `total` bằng cách chỉnh mục của `day`: mục ngày đó = total − tổng các
 * ngày khác (kẹp ≥ 0). Dùng cho ô "Đã làm được" trong form chart — người dùng nghĩ theo tổng,
 * DB lưu theo ngày. Tổng nhỏ hơn tổng các ngày khác thì không biểu diễn được bằng số ≥ 0:
 * mục hôm nay về 0 và tổng dừng ở mức các ngày khác — sửa từng ngày trong nhật ký nếu cần.
 */
export async function setProgressTotal(chartId: string, day: string, total: number, createdBy: string): Promise<void> {
  const { data, error } = await supabase
    .from('velocity_chart_progress')
    .select('done_qty')
    .eq('chart_id', chartId)
    .neq('day', day);
  if (error) throw error;
  const others = (data ?? []).reduce((s, r) => s + Number(r.done_qty ?? 0), 0);
  await logProgress(chartId, day, Math.max(0, total - others), createdBy);
}

export async function deleteProgress(chartId: string, day: string): Promise<void> {
  const { error } = await supabase
    .from('velocity_chart_progress')
    .delete()
    .eq('chart_id', chartId)
    .eq('day', day);
  if (error) throw error;
}
