// useTaskSprints — lịch sử sprint của MỘT task (bảng `task_sprints`, migration 0015),
// sắp theo lúc vào sprint. Live có filter theo task_id: đổi sprint ngay trong modal là
// trigger DB ghi dòng mới → realtime dội về → danh sách tự cập nhật.

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { rowToTaskSprint } from '../lib/mappers';
import { useLiveQuery } from './useLiveQuery';
import type { TaskSprintEntry } from '../types';

export function useTaskSprints(taskId: string | null) {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('task_sprints')
      .select('sprint_id, added_at')
      .eq('task_id', taskId)
      .order('added_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToTaskSprint);
  }, [taskId]);

  const { data: entries, loading } = useLiveQuery<TaskSprintEntry>({
    table: 'task_sprints',
    fetcher,
    filter: taskId ? `task_id=eq.${taskId}` : undefined,
    deps: [taskId],
    enabled: Boolean(taskId),
  });

  return { entries, loading };
}
