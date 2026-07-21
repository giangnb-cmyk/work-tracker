// Admin-only project-membership writes. RLS (migration 0052) requires admin/owner for
// insert/delete; a member calling these just gets a 42501 the caller surfaces.

import { supabase } from '../supabase';

/** Thêm một loạt người (từ roster toàn web) vào dự án. Bỏ qua người đã có (idempotent). */
export async function addProjectMembers(
  projectId: string,
  userIds: string[],
  addedBy: string | null,
): Promise<void> {
  if (userIds.length === 0) return;
  const rows = userIds.map((uid) => ({ project_id: projectId, user_id: uid, added_by: addedBy }));
  const { error } = await supabase
    .from('project_members')
    .upsert(rows, { onConflict: 'project_id,user_id', ignoreDuplicates: true });
  if (error) throw error;
}

/** Gỡ một người khỏi dự án. Task/bug của họ KHÔNG đụng tới — chỉ bỏ khỏi danh sách. */
export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId);
  if (error) throw error;
}
