// useVelocityCharts — chart Gantt tốc độ của một dự án (bảng `velocity_charts`, 0085).

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { rowToVelocityChart } from '../lib/mappers';
import { useLiveQuery } from './useLiveQuery';
import type { VelocityChart } from '../types';

export function useVelocityCharts(projectId: string | null) {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('velocity_charts')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
      .order('start_date', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToVelocityChart);
  }, [projectId]);

  const { data: charts, loading, refetch } = useLiveQuery<VelocityChart>({
    table: 'velocity_charts',
    fetcher,
    filter: projectId ? `project_id=eq.${projectId}` : undefined,
    deps: [projectId],
    enabled: Boolean(projectId),
  });

  return { charts, loading, refetch };
}
