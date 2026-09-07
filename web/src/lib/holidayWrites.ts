// Ghi ngày lễ toàn công ty (`holidays`, migration 0085). Admin / 'sprint.manage'.

import { supabase } from '../supabase';

/** Thêm hoặc đổi tên một ngày lễ — khoá là chính ngày đó nên thêm lại = đổi tên. */
export async function upsertHoliday(day: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('holidays')
    .upsert({ day, name: name.trim() }, { onConflict: 'day' });
  if (error) throw error;
}

export async function deleteHoliday(day: string): Promise<void> {
  const { error } = await supabase.from('holidays').delete().eq('day', day);
  if (error) throw error;
}
