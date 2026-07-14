// useActivity — live activity feed for one task (newest first).

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { rowToActivity } from '../lib/mappers';
import { useLiveQuery } from './useLiveQuery';
import type { Activity } from '../types';

export function useActivity(taskId: string | null) {
  const fetcher = useCallback(async () => {
    if (!taskId) return [];
    const { data, error } = await supabase
      .from('activity')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []).map(rowToActivity);
  }, [taskId]);

  const { data: items, loading } = useLiveQuery<Activity>({
    table: 'activity',
    fetcher,
    filter: taskId ? `task_id=eq.${taskId}` : undefined,
    deps: [taskId],
    enabled: Boolean(taskId),
  });

  return { items, loading };
}
