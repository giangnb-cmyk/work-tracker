// Role (bảng `roles`, 0072) writes. RLS: đọc mở cho người đã đăng nhập, ghi admin-only —
// role mang bộ quyền nên việc tạo/sửa là surface phân quyền, không mở cho member.

import { supabase } from '../supabase';
import type { MemberPerm, TeamRole } from '../types';

export interface RoleInput {
  name: string;
  icon: string;
  perms: MemberPerm[];
}

export async function createRole(input: RoleInput, sort: number): Promise<string> {
  const { data, error } = await supabase
    .from('roles')
    .insert({ name: input.name.trim(), icon: input.icon || '👤', perms: input.perms, sort })
    .select('id')
    .single();
  if (error) throw readableRoleError(error.code, error.message);
  return data.id as string;
}

export async function updateRole(id: string, patch: Partial<TeamRole>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.icon !== undefined) row.icon = patch.icon || '👤';
  if (patch.perms !== undefined) row.perms = patch.perms;
  if (patch.sort !== undefined) row.sort = patch.sort;
  const { error } = await supabase.from('roles').update(row).eq('id', id);
  if (error) throw readableRoleError(error.code, error.message);
}

/** Xoá role: profiles.role_id của người đang mang role này tự về NULL (FK set null). */
export async function deleteRole(id: string): Promise<void> {
  const { error } = await supabase.from('roles').delete().eq('id', id);
  if (error) throw readableRoleError(error.code, error.message);
}

function readableRoleError(code: string, message: string): Error {
  if (code === '23505') return new Error('Tên role này đã có rồi — đặt tên khác nhé.');
  if (code === '42501') return new Error('Không đủ quyền: tạo/sửa role cần admin.');
  return new Error(message || 'Lưu role thất bại.');
}
