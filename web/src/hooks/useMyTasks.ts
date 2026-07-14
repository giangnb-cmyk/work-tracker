// useMyTasks — all tasks assigned to a user across every sprint.

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { rowToTask } from '../lib/mappers';
import { useLiveQuery } from './useLiveQuery';
import type { Task } from '../types';

export function useMyTasks(uid: string) {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('assignee_id', uid)
      .order('order', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToTask);
  }, [uid]);

  const { data: tasks, loading } = useLiveQuery<Task>({
    table: 'tasks',
    fetcher,
    filter: `assignee_id=eq.${uid}`,
    deps: [uid],
    enabled: Boolean(uid),
  });

  return { tasks, loading };
}
