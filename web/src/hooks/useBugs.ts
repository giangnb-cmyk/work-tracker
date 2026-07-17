// useBugs — live bugs for one project.

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { BUG_SUMMARY_COLUMNS, rowToBug } from '../lib/mappers';
import { useLiveQuery } from './useLiveQuery';
import type { Bug } from '../types';

export function useBugs(projectId: string | null) {
  const fetcher = useCallback(async () => {
    // Chỉ tải VỎ bug (không description/attachments) — xem BUG_SUMMARY_COLUMNS.
    const { data, error } = await supabase
      .from('bugs')
      .select(BUG_SUMMARY_COLUMNS)
      .eq('project_id', projectId as string)
      .order('number', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToBug);
  }, [projectId]);

  const { data: bugs, loading } = useLiveQuery<Bug>({
    table: 'bugs',
    fetcher,
    filter: projectId ? `project_id=eq.${projectId}` : undefined,
    deps: [projectId],
    enabled: Boolean(projectId),
  });

  return { bugs, loading };
}
