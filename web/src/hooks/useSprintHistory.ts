// useSprintHistory — MỌI task từng thuộc một sprint, kể cả task nay đã bị chuyển sang
// sprint khác. `useTasks(sprintId)` chỉ trả task đang thuộc sprint; hook này bù phần
// lịch sử cho mục "Đã chuyển sang sprint khác".

import { useCallback } from 'react';
import { supabase } from '../supabase';
import { rowToTask } from '../lib/mappers';
import { useLiveQuery } from './useLiveQuery';
import type { Task } from '../types';

export function useSprintHistory(sprintId: string | null) {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('task_sprints')
      .select('tasks!inner(*)')
      .eq('sprint_id', sprintId as string);
    if (error) throw error;
    // Lọc "đã chuyển đi" ở phía client chứ không bằng .neq('tasks.sprint_id', id):
    // trong SQL `sprint_id <> X` cho NULL khi task bị đẩy về backlog, nên task đó sẽ
    // bị rụng khỏi kết quả thay vì được tính là đã rời sprint.
    return (data ?? []).map((r) => rowToTask((r as Record<string, any>).tasks));
  }, [sprintId]);

  // Kênh realtime bám bảng `tasks` chứ không phải `task_sprints`: chuyển task đi chỉ
  // THÊM dòng cho sprint MỚI, nên filter theo sprint cũ sẽ không bao giờ nhận được sự
  // kiện và danh sách sẽ đứng hình.
  const { data: everTasks, loading } = useLiveQuery<Task>({
    table: 'tasks',
    fetcher,
    deps: [sprintId],
    enabled: Boolean(sprintId),
  });

  return { everTasks, loading };
}
