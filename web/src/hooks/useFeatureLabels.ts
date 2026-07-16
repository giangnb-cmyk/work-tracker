// useFeatureLabels — live feature-label palette for one project.

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { rowToFeatureLabel } from '../lib/mappers';
import { useLiveQuery } from './useLiveQuery';
import type { FeatureLabel } from '../types';

export function useFeatureLabels(projectId: string | null) {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('feature_labels')
      .select('*')
      .eq('project_id', projectId as string)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToFeatureLabel);
  }, [projectId]);

  const { data: labels, loading } = useLiveQuery<FeatureLabel>({
    table: 'feature_labels',
    fetcher,
    filter: projectId ? `project_id=eq.${projectId}` : undefined,
    deps: [projectId],
    enabled: Boolean(projectId),
  });

  return { labels, loading };
}
