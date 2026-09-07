// useVelocityProgress — nhật ký tiến độ của MỘT chart (bảng `velocity_chart_progress`, 0086).
// Chỉ mở khi dòng Gantt được xổ ra (chartId null = không subscribe).

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { rowToVelocityProgress } from '../lib/mappers';
import { useLiveQuery } from './useLiveQuery';
import type { VelocityProgress } from '../types';

export function useVelocityProgress(chartId: string | null) {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('velocity_chart_progress')
      .select('*')
      .eq('chart_id', chartId)
      .order('day', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToVelocityProgress);
  }, [chartId]);

  const { data: entries, loading } = useLiveQuery<VelocityProgress>({
    table: 'velocity_chart_progress',
    fetcher,
    filter: chartId ? `chart_id=eq.${chartId}` : undefined,
    deps: [chartId],
    enabled: Boolean(chartId),
  });

  return { entries, loading };
}
