// useProjectCosts — dữ liệu LIVE cho tab "Chi phí" của một dự án: lương nhân viên,
// chi phí thiết bị/vận hành, và các khoản dự chi. Ba bảng độc lập nên gọi useLiveQuery
// ba lần (mỗi bảng tự subscribe realtime, lọc theo project_id) rồi gộp lại cho gọn.

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { rowToCostEmployee, rowToCostItem, rowToCostProjection } from '../lib/mappers';
import type { CostEmployee, CostItem, CostProjection } from '../types';
import { useLiveQuery } from './useLiveQuery';

export function useProjectCosts(projectId: string | null) {
  const pid = projectId ?? '';
  const filter = projectId ? `project_id=eq.${projectId}` : undefined;
  const enabled = Boolean(projectId);

  const employeesFetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('project_cost_employees')
      .select('*')
      .eq('project_id', pid)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToCostEmployee);
  }, [pid]);

  const itemsFetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('project_cost_items')
      .select('*')
      .eq('project_id', pid)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToCostItem);
  }, [pid]);

  const projectionsFetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('project_cost_projections')
      .select('*')
      .eq('project_id', pid)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToCostProjection);
  }, [pid]);

  const { data: employees, loading: employeesLoading } = useLiveQuery<CostEmployee>({
    table: 'project_cost_employees',
    fetcher: employeesFetcher,
    filter,
    deps: [pid],
    enabled,
  });

  const { data: items, loading: itemsLoading } = useLiveQuery<CostItem>({
    table: 'project_cost_items',
    fetcher: itemsFetcher,
    filter,
    deps: [pid],
    enabled,
  });

  const { data: projections, loading: projectionsLoading } = useLiveQuery<CostProjection>({
    table: 'project_cost_projections',
    fetcher: projectionsFetcher,
    filter,
    deps: [pid],
    enabled,
  });

  return {
    employees,
    items,
    projections,
    loading: employeesLoading || itemsLoading || projectionsLoading,
  };
}
