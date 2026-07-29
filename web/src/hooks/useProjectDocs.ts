// useProjectDocs — thư viện tài liệu của một dự án (bảng `project_docs`, migration 0066).
// Live: thêm/sửa/xoá ở tab Tài liệu là ô chọn trong TaskModal/FeatureModal thấy ngay.

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { rowToProjectDoc } from '../lib/mappers';
import { useLiveQuery } from './useLiveQuery';
import type { ProjectDoc } from '../types';

export function useProjectDocs(projectId: string | null) {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('project_docs')
      .select('*')
      .eq('project_id', projectId)
      // sort_order trước để admin kéo mục quan trọng lên đầu; cùng hạng thì mới nhất trước.
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToProjectDoc);
  }, [projectId]);

  const { data: docs, loading, refetch } = useLiveQuery<ProjectDoc>({
    table: 'project_docs',
    fetcher,
    filter: projectId ? `project_id=eq.${projectId}` : undefined,
    deps: [projectId],
    enabled: Boolean(projectId),
  });

  return { docs, loading, refetch };
}
