// useFeatures — live feature list from `features`. Read-only for the UI.
// Loads all features; views filter by the active project.

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { rowToFeature } from '../lib/mappers';
import { useLiveQuery } from './useLiveQuery';
import type { Feature } from '../types';

export function useFeatures() {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('features')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToFeature);
  }, []);

  const { data: features, loading, refetch } = useLiveQuery<Feature>({
    table: 'features',
    fetcher,
    deps: [],
  });

  // refetch để hiện feature mới/sửa NGAY sau khi ghi, không đợi realtime dội về
  // (cùng khuôn với useSprints).
  return { features, loading, refetch };
}
