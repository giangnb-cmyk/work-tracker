// useProjectTasks — all tasks belonging to one project, across sprints.

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { rowToTask } from '../lib/mappers';
import { useLiveQuery } from './useLiveQuery';
import type { Task } from '../types';

export function useProjectTasks(projectId: string | null) {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('project_id', projectId as string)
      .order('order', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToTask);
  }, [projectId]);

  const { data: tasks, loading, refetch } = useLiveQuery<Task>({
    table: 'tasks',
    fetcher,
    filter: projectId ? `project_id=eq.${projectId}` : undefined,
    deps: [projectId],
    enabled: Boolean(projectId),
  });

  return { tasks, loading, refetch };
}
