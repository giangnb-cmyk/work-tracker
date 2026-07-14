// useProjects — live project list from `projects`. Read-only for the UI.

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { rowToProject } from '../lib/mappers';
import { useLiveQuery } from './useLiveQuery';
import type { Project } from '../types';

export function useProjects() {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToProject);
  }, []);

  const { data: projects, loading } = useLiveQuery<Project>({
    table: 'projects',
    fetcher,
    deps: [],
  });

  return { projects, loading };
}
