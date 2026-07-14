import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useMyTasks } from '../hooks/useMyTasks';
import { becameDone, moveTask } from '../lib/taskWrites';
import { useNotify } from '../contexts/NotifyContext';
import TaskModal from './TaskModal';
import { formatDateRange } from '../lib/format';
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  TASK_STATUSES,
  type Task,
  type TaskStatus,
} from '../types';

/** A focused list of the current user's tasks with quick status changes. */
export default function MyTasks() {
  const { user } = useAuth();
  const { sprints } = useSprintContext();
  const { confirmDoneNotify } = useNotify();
  const { tasks, loading } = useMyTasks(user?.uid ?? '');
  const [editing, setEditing] = useState<Task | null>(null);

  const sprintName = useMemo(() => {
    const map = new Map(sprints.map((s) => [s.id, s.name]));
    return (id: string | null) => (id ? map.get(id) ?? '—' : 'Backlog');
  }, [sprints]);

  const open = tasks.filter((t) => t.status !== 'done');
  const done = tasks.filter((t) => t.status === 'done');

  async function quickStatus(task: Task, status: TaskStatus) {
    if (status === task.status) return;
    const justFinished = becameDone(task.status, status);
    await moveTask(task, status, task.order);
    if (justFinished) confirmDoneNotify({ ...task, status }, sprintName(task.sprintId));
  }

  if (loading) {
    return (
      <div className="center-screen" style={{ minHeight: 200 }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="view-header">
        <h1>Task của tôi</h1>
        <p>{open.length} task đang mở · {done.length} đã xong.</p>
      </div>

      {tasks.length === 0 ? (
        <div className="glass empty">Bạn chưa được giao task nào. 🎉</div>
      ) : (
        <div className="glass table-container section" style={{ padding: '0.5rem' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Sprint</th>
                <th>Ưu tiên</th>
                <th>Hạn</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {[...open, ...done].map((t) => (
                <tr key={t.id} style={{ cursor: 'pointer' }}>
                  <td onClick={() => setEditing(t)}>
                    {t.title}
                    {t.notionUrl && (
                      <a href={t.notionUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>🔗</a>
                    )}
                  </td>
                  <td className="muted" onClick={() => setEditing(t)}>{sprintName(t.sprintId)}</td>
                  <td onClick={() => setEditing(t)}>
                    <span className={`badge prio-${t.priority}`}>{PRIORITY_LABEL[t.priority]}</span>
                  </td>
                  <td className="muted mono" onClick={() => setEditing(t)}>{formatDateRange(t.dueStart, t.dueDate)}</td>
                  <td>
                    <select
                      className="select"
                      style={{ width: 'auto', padding: '0.3rem 0.5rem' }}
                      value={t.status}
                      onChange={(e) => quickStatus(t, e.target.value as TaskStatus)}
                    >
                      {TASK_STATUSES.map((s) => (
                        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <TaskModal task={editing} defaultSprintId={editing.sprintId} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
