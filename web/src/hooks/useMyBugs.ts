// useMyBugs — live bugs assigned to a user inside one project.

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { rowToBug } from '../lib/mappers';
import { useLiveQuery } from './useLiveQuery';
import type { Bug } from '../types';

/**
 * Bug đang giao cho `uid` trong `projectId`. Kênh realtime chỉ nhận MỘT filter nên
 * nó bám theo assignee_id; phần lọc dự án nằm trong fetcher. Scope theo dự án là bắt
 * buộc: nhãn bug (`useBugLabels`) và `BugModal` đều theo dự án.
 */
export function useMyBugs(uid: string, projectId: string | null) {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('bugs')
      .select('*')
      .eq('assignee_id', uid)
      .eq('project_id', projectId as string)
      .order('number', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToBug);
  }, [uid, projectId]);

  const { data: bugs, loading } = useLiveQuery<Bug>({
    table: 'bugs',
    fetcher,
    filter: uid ? `assignee_id=eq.${uid}` : undefined,
    deps: [uid, projectId],
    enabled: Boolean(uid && projectId),
  });

  return { bugs, loading };
}
