// Xếp yêu cầu đồng bộ lịch phát hành. Bot (service role) rút `release_sync_requests`,
// đọc tab 'Timeline' của sheet release rồi ghi lại feature_labels.release_date.
// Web không đọc được Google Sheets nên phải đi vòng này — xem migration 0033.
// RLS: chỉ admin được xếp yêu cầu.

import { supabase } from '../supabase';

export async function requestReleaseSync(projectId: string, requestedBy: string): Promise<void> {
  const { error } = await supabase
    .from('release_sync_requests')
    .insert({ project_id: projectId, requested_by: requestedBy || null });
  if (error) throw error;
}
