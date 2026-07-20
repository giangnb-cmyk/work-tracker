// useMyOpenTaskCounts — số task CHƯA XONG của user, gộp theo sprint. Dùng cho badge số
// cạnh tên sprint trong dropdown (TopBar) khi đang ở "Task của tôi": người dùng lọc theo
// sprint đang chọn nhưng vẫn thấy sprint KHÁC còn việc tồn đọng.
//
// Chỉ kéo 2 cột (sprint_id, status) thay vì cả hàng — nhẹ, và cũng không cần map sang Task.

import { useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { useLiveQuery } from './useLiveQuery';

/** Khoá cho task không thuộc sprint nào (Backlog) — trùng value option ở TopBar. */
export const BACKLOG_COUNT_KEY = 'backlog';

interface OpenTaskRow {
  sprint_id: string | null;
  status: string;
}

/**
 * Trả về Map<sprintId | 'backlog', số task chưa xong của user>. `enabled=false` (vd không
 * ở view Task của tôi) thì bỏ hẳn, không mở subscription thừa.
 */
export function useMyOpenTaskCounts(uid: string, enabled = true): Map<string, number> {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('sprint_id, status')
      .eq('assignee_id', uid)
      .neq('status', 'done');
    if (error) throw error;
    return (data ?? []) as OpenTaskRow[];
  }, [uid]);

  const { data } = useLiveQuery<OpenTaskRow>({
    table: 'tasks',
    fetcher,
    filter: `assignee_id=eq.${uid}`,
    deps: [uid],
    enabled: enabled && Boolean(uid),
  });

  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of data) {
      const key = row.sprint_id ?? BACKLOG_COUNT_KEY;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [data]);
}
