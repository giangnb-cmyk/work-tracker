// useTasks — LIVE tasks for one sprint (or backlog when sprintId is null).
// Write operations live in lib/taskWrites.ts so views share them without extra listeners.

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { rowToTask } from '../lib/mappers';
import { useLiveQuery } from './useLiveQuery';
import type { Task } from '../types';

export function useTasks(sprintId: string | null) {
  const fetcher = useCallback(async () => {
    let q = supabase.from('tasks').select('*').order('order', { ascending: true });
    q = sprintId ? q.eq('sprint_id', sprintId) : q.is('sprint_id', null);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(rowToTask);
  }, [sprintId]);

  const { data: tasks, loading } = useLiveQuery<Task>({
    table: 'tasks',
    fetcher,
    filter: sprintId ? `sprint_id=eq.${sprintId}` : undefined,
    deps: [sprintId],
  });

  return { tasks, loading };
}
