// Admin-only member (profiles row) writes. RLS requires admin for create/delete.
// Members created here (for Discord-only teammates who never sign in) get an
// auto-generated uuid id; real sign-ins are keyed by their Supabase Auth uid.
//
// Một email = MỘT hồ sơ (index `profiles_email_unique_idx`, migration 0028). Tạo tay trùng
// email với người đã có tài khoản sẽ bị DB chặn — trước 0028 nó lặng lẽ nhân đôi hồ sơ.

import { supabase } from '../supabase';
import type { PostgrestError } from '@supabase/supabase-js';
import type { JobRole, MemberPerm, TeamMember, UserRole } from '../types';

export interface MemberInput {
  displayName: string;
  email: string;
  role: UserRole;
  perms: MemberPerm[];
  jobRole: JobRole;
  discordId: string;
  notionUserId: string;
}

/** Người dùng nhập trùng — sửa được ngay trên form, KHÁC lỗi quyền/mạng. */
export class MemberConflictError extends Error {}

/**
 * Dịch lỗi unique của Postgres sang câu người đọc được.
 *
 * `profiles` có ĐÚNG hai index unique: `lower(email)` (0028) và `discord_id` (0017). Cả hai
 * đều là nhập trùng chứ không phải thiếu quyền — để nó rơi vào nhánh "cần quyền admin"
 * chung chung là chỉ sai hướng cho đúng người đang đi sửa.
 */
function conflictOf(error: PostgrestError, input: Partial<MemberInput>): MemberConflictError | null {
  if (error.code !== '23505') return null;
  const raw = `${error.message} ${error.details ?? ''}`;
  if (raw.includes('profiles_email_unique_idx')) {
    return new MemberConflictError(
      `Email ${input.email?.trim() ?? ''} đã có hồ sơ rồi — mở người đó ra sửa thay vì tạo mới.`,
    );
  }
  if (raw.includes('profiles_discord_id_key')) {
    return new MemberConflictError(`Discord ID ${input.discordId?.trim() ?? ''} đang gắn cho người khác rồi.`);
  }
  return new MemberConflictError('Trùng dữ liệu với một hồ sơ đã có.');
}

export async function createMember(input: MemberInput): Promise<string> {
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      display_name: input.displayName.trim(),
      email: input.email.trim(),
      role: input.role,
      perms: input.perms,
      job_role: input.jobRole,
      discord_id: input.discordId.trim(),
      notion_user_id: input.notionUserId.trim(),
      photo_url: '',
    })
    .select('id')
    .single();
  if (error) throw conflictOf(error, input) ?? error;
  return data.id as string;
}

export async function updateMember(uid: string, patch: Partial<TeamMember>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.displayName !== undefined) row.display_name = patch.displayName;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.role !== undefined) row.role = patch.role;
  if (patch.perms !== undefined) row.perms = patch.perms;
  if (patch.jobRole !== undefined) row.job_role = patch.jobRole;
  if (patch.discordId !== undefined) row.discord_id = patch.discordId;
  if (patch.notionUserId !== undefined) row.notion_user_id = patch.notionUserId;
  const { error } = await supabase.from('profiles').update(row).eq('id', uid);
  // Sửa cũng đụng unique được: gõ email của người khác vào hồ sơ này là trùng ngay.
  if (error) throw conflictOf(error, { email: patch.email, discordId: patch.discordId }) ?? error;
}

export async function deleteMember(uid: string): Promise<void> {
  const { error } = await supabase.from('profiles').delete().eq('id', uid);
  if (error) throw error;
}
