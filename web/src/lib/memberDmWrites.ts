// Queue a TEST weekly-summary DM: the bot (service role) drains `member_dm_requests`
// and DMs the chosen member their done/pending counts. RLS: admin-only insert AND
// select (migration 0025) — this is an admin test tool.

import { supabase } from '../supabase';

export interface MemberDmRequestStatus {
  status: 'pending' | 'done' | 'error';
  result: string;
}

/** Insert a test request and return its id so the caller can watch the status. */
export async function requestMemberDmTest(targetUserId: string, requestedBy: string): Promise<string> {
  const { data, error } = await supabase
    .from('member_dm_requests')
    .insert({ target_user_id: targetUserId, requested_by: requestedBy || null })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function fetchMemberDmRequest(id: string): Promise<MemberDmRequestStatus> {
  const { data, error } = await supabase
    .from('member_dm_requests')
    .select('status, result')
    .eq('id', id)
    .single();
  if (error) throw error;
  return { status: data.status, result: data.result ?? '' };
}
