// useBugLabels — live bug-label palette for one project.

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { rowToBugLabel } from '../lib/mappers';
import { useLiveQuery } from './useLiveQuery';
import type { BugLabel } from '../types';

export function useBugLabels(projectId: string | null) {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('bug_labels')
      .select('*')
      .eq('project_id', projectId as string)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToBugLabel);
  }, [projectId]);

  const { data: labels, loading } = useLiveQuery<BugLabel>({
    table: 'bug_labels',
    fetcher,
    filter: projectId ? `project_id=eq.${projectId}` : undefined,
    deps: [projectId],
    enabled: Boolean(projectId),
  });

  return { labels, loading };
}
