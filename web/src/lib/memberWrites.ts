// Admin-only member (profiles row) writes. RLS requires admin for create/delete.
// Members created here (for Discord-only teammates who never sign in) get an
// auto-generated uuid id; real sign-ins are keyed by their Supabase Auth uid.

import { supabase } from '../supabase';
import type { JobRole, TeamMember, UserRole } from '../types';

export interface MemberInput {
  displayName: string;
  email: string;
  role: UserRole;
  jobRole: JobRole;
  discordId: string;
  notionUserId: string;
}

export async function createMember(input: MemberInput): Promise<string> {
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      display_name: input.displayName.trim(),
      email: input.email.trim(),
      role: input.role,
      job_role: input.jobRole,
      discord_id: input.discordId.trim(),
      notion_user_id: input.notionUserId.trim(),
      photo_url: '',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateMember(uid: string, patch: Partial<TeamMember>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.displayName !== undefined) row.display_name = patch.displayName;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.jobRole !== undefined) row.job_role = patch.jobRole;
  if (patch.discordId !== undefined) row.discord_id = patch.discordId;
  if (patch.notionUserId !== undefined) row.notion_user_id = patch.notionUserId;
  const { error } = await supabase.from('profiles').update(row).eq('id', uid);
  if (error) throw error;
}

export async function deleteMember(uid: string): Promise<void> {
  const { error } = await supabase.from('profiles').delete().eq('id', uid);
  if (error) throw error;
}
