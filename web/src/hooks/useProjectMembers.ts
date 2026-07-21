// useProjectMembers — LIVE membership rows for one project (who was added to it).
// Trả về quan hệ thô (user_id + added_at); component ghép với roster toàn web trong
// SprintContext để ra hồ sơ đầy đủ. Tách vậy để không tải trùng bảng profiles.

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { useLiveQuery } from './useLiveQuery';

export interface ProjectMembership {
  userId: string;
  addedAt: string | null;
}

export function useProjectMembers(projectId: string | null) {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('project_members')
      .select('user_id, added_at')
      .eq('project_id', projectId as string);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      userId: r.user_id as string,
      addedAt: (r.added_at as string | null) ?? null,
    }));
  }, [projectId]);

  const { data: memberships, loading, refetch } = useLiveQuery<ProjectMembership>({
    table: 'project_members',
    fetcher,
    filter: projectId ? `project_id=eq.${projectId}` : undefined,
    deps: [projectId],
    enabled: Boolean(projectId),
  });

  return { memberships, loading, refetch };
}
