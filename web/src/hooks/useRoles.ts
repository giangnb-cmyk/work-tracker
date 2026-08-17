// useRoles — live list of custom roles (bảng `roles`, 0072). Dùng ở RolePicker
// (user mới chọn role), tab Role — Roles/RoleEditor (admin CRUD) và MemberModal (admin gán role).

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { rowToRole } from '../lib/mappers';
import { useLiveQuery } from './useLiveQuery';
import type { TeamRole } from '../types';

export function useRoles() {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .order('sort', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToRole);
  }, []);

  const { data: roles, loading } = useLiveQuery<TeamRole>({
    table: 'roles',
    fetcher,
    deps: [],
  });

  return { roles, loading };
}
