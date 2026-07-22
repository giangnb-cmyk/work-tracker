// useCostEmployees — dòng lương (project_cost_employees) LIVE của một dự án. Tách riêng để
// dùng chung: tab Chi phí (qua useProjectCosts) và tab Thành viên (admin điền lương thẳng
// vào hàng thành viên). `enabled` để tab Thành viên chỉ chạy query khi người xem là admin —
// RLS admin-only nên member gọi vào cũng rỗng, khỏi mở socket thừa.

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { rowToCostEmployee } from '../lib/mappers';
import type { CostEmployee } from '../types';
import { useLiveQuery } from './useLiveQuery';

export function useCostEmployees(projectId: string | null, enabled = true) {
  const pid = projectId ?? '';
  const on = enabled && Boolean(projectId);

  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('project_cost_employees')
      .select('*')
      .eq('project_id', pid)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToCostEmployee);
  }, [pid]);

  const { data, loading } = useLiveQuery<CostEmployee>({
    table: 'project_cost_employees',
    fetcher,
    filter: projectId ? `project_id=eq.${projectId}` : undefined,
    deps: [pid, on],
    enabled: on,
  });

  return { employees: data, loading };
}
