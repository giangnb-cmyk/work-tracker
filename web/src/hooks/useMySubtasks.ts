// useMySubtasks — subtask được giao cho một người, kèm task cha của nó.
//
// Subtask nằm trong cột jsonb `tasks.subtasks` chứ không phải bảng riêng, nên "subtask của
// tôi" = task nào CHỨA một phần tử có assigneeId = tôi (`contains`, toán tử jsonb @>).
// Task cha có thể của người khác — đó chính là điểm của việc giao subtask, nên KHÔNG lọc
// theo tasks.assignee_id.

import { useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { rowToTask } from '../lib/mappers';
import { useLiveQuery } from './useLiveQuery';
import type { Subtask, Task } from '../types';

export interface MySubtask {
  subtask: Subtask;
  task: Task;
}

export function useMySubtasks(uid: string) {
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      // PHẢI truyền CHUỖI JSON, không phải mảng JS: postgrest-js thấy Array là dịch thành
      // mảng Postgres `cs.{...}` bằng value.join(',') — với mảng object thì ra
      // `cs.{[object Object]}`, một filter vô nghĩa khớp 0 dòng mà KHÔNG báo lỗi (đã cắn
      // thật: mục "Subtask của tôi" trống trơn). Chuỗi thì nó gửi thẳng: `cs.[{...}]` = @> jsonb.
      .contains('subtasks', JSON.stringify([{ assigneeId: uid }]))
      .order('order', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToTask);
  }, [uid]);

  // KHÔNG đặt `filter`: kênh realtime chỉ lọc được theo cột thường, mà điều kiện ở đây nằm
  // trong jsonb. Lọc theo assignee_id thì hụt đúng trường hợp cần — task của người khác mà
  // mình giữ một subtask. Chấp nhận nghe cả bảng (RLS vẫn chặn, số dòng nhỏ).
  const { data: tasks, loading } = useLiveQuery<Task>({
    table: 'tasks',
    fetcher,
    deps: [uid],
    enabled: Boolean(uid),
  });

  const items = useMemo(() => {
    const out: MySubtask[] = [];
    for (const task of tasks) {
      for (const subtask of task.subtasks ?? []) {
        if (subtask.assigneeId === uid) out.push({ subtask, task });
      }
    }
    return out;
  }, [tasks, uid]);

  return { items, loading };
}
