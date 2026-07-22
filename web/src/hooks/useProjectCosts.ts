// useProjectCosts — chi phí thiết bị/vận hành + dự chi của MỘT dự án (LIVE). Lương KHÔNG ở
// đây nữa: nó là thuộc tính toàn cục của người (member_compensation, xem useMemberComp) và
// bảng chi phí ghép với thành viên dự án ở CostManagement.

import { useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { rowToCostItem, rowToCostMemberItems, rowToCostProjection } from '../lib/mappers';
import type { CostItem, CostMemberItems, CostProjection } from '../types';
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

  const { data: items, loading: itemsLoading, refetch: refetchItems } = useLiveQuery<CostItem>({
    table: 'project_cost_items',
    fetcher: itemsFetcher,
    filter,
    deps: [pid],
    enabled,
  });

  const { data: projections, loading: projectionsLoading, refetch: refetchProjections } = useLiveQuery<CostProjection>({
    table: 'project_cost_projections',
    fetcher: projectionsFetcher,
    filter,
    deps: [pid],
    enabled,
  });

  const memberItemsFetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('project_cost_member_items')
      .select('*')
      .eq('project_id', pid);
    if (error) throw error;
    return (data ?? []).map(rowToCostMemberItems);
  }, [pid]);

  const { data: memberItemRows, loading: memberItemsLoading, refetch: refetchMemberItems } =
    useLiveQuery<CostMemberItems>({
      table: 'project_cost_member_items',
      fetcher: memberItemsFetcher,
      filter,
      deps: [pid],
      enabled,
    });

  /** memberId → các khoản chi phí đã gán (tra trong bảng lương + tính tổng). */
  const memberItemIds = useMemo(
    () => new Map(memberItemRows.map((r) => [r.memberId, r.itemIds])),
    [memberItemRows],
  );

  // refetch* để lớp ghi lạc quan (useOptimisticList) chốt lại sự thật server ngay sau khi
  // ghi, thay vì đợi realtime dội về + debounce.
  return {
    items,
    projections,
    memberItemIds,
    refetchItems,
    refetchProjections,
    refetchMemberItems,
    loading: itemsLoading || projectionsLoading || memberItemsLoading,
  };
}
