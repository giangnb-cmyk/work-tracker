// useTaskReport — lịch sử sprint + mốc thời gian của mọi task trong một dự án, gộp sẵn
// bởi RPC `task_report` (migration 0016). Nền cho trang Hiệu suất.
//
// CỐ Ý không dùng useLiveQuery: nó bám realtime cả bảng `activity`, nghĩa là toàn bộ
// phép tổng hợp sẽ chạy lại mỗi khi có người comment ở bất kỳ đâu trong app. Đây là màn
// phân tích, không phải bảng công việc — tải một lần, kèm nút "Tải lại".

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { rowToTaskReport } from '../lib/mappers';
import type { TaskReport } from '../lib/performance';

export function useTaskReport(projectId: string | null) {
  const [reports, setReports] = useState<Map<string, TaskReport>>(new Map());
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!projectId) {
      setReports(new Map());
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);

    supabase
      .rpc('task_report', { p_project_id: projectId })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          console.error('Tải dữ liệu hiệu suất thất bại', error);
          setReports(new Map());
        } else {
          const rows = (data ?? []).map(rowToTaskReport);
          setReports(new Map(rows.map((r: TaskReport) => [r.taskId, r])));
        }
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [projectId, nonce]);

  return { reports, loading, reload };
}
