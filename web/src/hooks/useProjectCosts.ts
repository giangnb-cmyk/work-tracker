// useProjectCosts — chi phí thiết bị/vận hành + dự chi của MỘT dự án (LIVE). Lương KHÔNG ở
// đây nữa: nó là thuộc tính toàn cục của người (member_compensation, xem useMemberComp) và
// bảng chi phí ghép với thành viên dự án ở CostManagement.

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { rowToCostItem, rowToCostProjection } from '../lib/mappers';
import type { CostItem, CostProjection } from '../types';
import { useLiveQuery } from './useLiveQuery';

export function useProjectCosts(projectId: string | null) {
  const pid = projectId ?? '';
  const filter = projectId ? `project_id=eq.${projectId}` : undefined;
  const enabled = Boolean(projectId);

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
    items,
    projections,
    loading: itemsLoading || projectionsLoading,
  };
}
