// Queue an on-demand bug sync. The bot (service role) drains `bug_sync_requests`
// and pulls the project's Discord forum into `bugs`. RLS: admin-only insert.

import { supabase } from '../supabase';

export async function requestBugSync(projectId: string, requestedBy: string): Promise<void> {
  const { error } = await supabase
    .from('bug_sync_requests')
    .insert({ project_id: projectId, requested_by: requestedBy || null });
  if (error) throw error;
}
