// Deep link /tasks/<id>: nạp task theo id rồi mở TaskModal đè lên view đang đứng dưới.
// Task nằm ở dự án khác thì tự nhảy sang dự án đó để context (feature, member…) khớp.

import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { rowToTask } from '../lib/mappers';
import { navigate } from '../lib/router';
import { useSprintContext } from '../contexts/SprintContext';
import TaskModal from './TaskModal';
import type { Task } from '../types';

interface TaskDeepLinkProps {
  taskId: string;
  /** Path quay về khi đóng modal (tab đang đứng dưới). */
  fallbackPath: string;
}

export default function TaskDeepLink({ taskId, fallbackPath }: TaskDeepLinkProps) {
  const { selectedProjectId, selectProject } = useSprintContext();
  const [task, setTask] = useState<Task | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) {
          console.error('Tải task theo link thất bại', error);
          setMissing(true);
          return;
        }
        const t = rowToTask(data);
        if (t.projectId && t.projectId !== selectedProjectId) selectProject(t.projectId);
        setTask(t);
      });
    return () => {
      alive = false;
    };
    // selectedProjectId cố ý không nằm trong deps: chỉ nạp theo taskId, việc đổi dự án
    // là hệ quả một lần chứ không phải lý do nạp lại.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const close = () => navigate(fallbackPath);

  if (missing) {
    return (
      <div className="modal-overlay" onClick={close}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>Không tìm thấy task</h2>
          <p className="muted">Task trong link không tồn tại — có thể đã bị xoá.</p>
          <div className="modal-actions">
            <button className="btn-primary" onClick={close}>Đóng</button>
          </div>
        </div>
      </div>
    );
  }
  if (!task) {
    return (
      <div className="modal-overlay">
        <div className="spinner" />
      </div>
    );
  }
  return (
    <TaskModal
      task={task}
      defaultSprintId={task.sprintId}
      defaultProjectId={task.projectId}
      onClose={close}
    />
  );
}
