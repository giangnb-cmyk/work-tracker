// useVisits — lượt truy cập trong N ngày gần đây (bảng `visits`, migration 0023).
//
// RLS `visits_select_admin` chỉ cho admin đọc; member gọi sẽ nhận mảng rỗng chứ không lỗi.

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { useLiveQuery } from './useLiveQuery';
import type { Visit } from '../lib/visitStats';

/**
 * Lấy lượt từ `sinceMs` trở lại đây.
 *
 * CỐ Ý lọc theo ngày ngay ở query chứ không kéo cả bảng: bảng này chỉ có thêm chứ không
 * bớt, để lâu sẽ chạm trần 1000 dòng của PostgREST và số liệu âm thầm sai (thiếu bớt lượt)
 * chứ không báo lỗi.
 */
export function useVisits(sinceMs: number, enabled = true) {
  const sinceIso = new Date(sinceMs).toISOString();

  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('visits')
      .select('id, user_id, at')
      .gte('at', sinceIso)
      .order('at', { ascending: false })
      .limit(10000);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id as string,
      userId: r.user_id as string,
      atMs: new Date(r.at as string).getTime(),
    }));
  }, [sinceIso]);

  const { data: visits, loading } = useLiveQuery<Visit>({
    table: 'visits',
    fetcher,
    deps: [sinceIso, enabled],
    enabled,
  });

  return { visits, loading };
}
