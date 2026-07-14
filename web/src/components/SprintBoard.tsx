import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useTasks } from '../hooks/useTasks';
import { moveTask } from '../lib/taskWrites';
import { STATUS_ORDER } from '../lib/sprint';
import TaskRow from './TaskRow';
import TaskModal from './TaskModal';
import { JOB_ROLES, type JobRole, type Task, type TaskStatus } from '../types';

/**
 * Sprint task LIST (not Kanban — the team is lazy about moving cards). Shows every
 * task with a progress bar and an inline quick-status control, filterable by the
 * assignee's team discipline (jobRole).
 */
export default function SprintBoard() {
  const { user, isAdmin } = useAuth();
  const { selectedSprintId, selectedSprint, members } = useSprintContext();
  const { tasks, loading } = useTasks(selectedSprintId);
  const [editing, setEditing] = useState<Task | null>(null);
  const [filterRole, setFilterRole] = useState<JobRole | 'all'>('all');

  // uid → jobRole, so we can filter tasks by who they're assigned to.
  const jobRoleOf = useMemo(() => {
    const map = new Map(members.map((m) => [m.uid, m.jobRole]));
    return (uid: string | null) => (uid ? map.get(uid) : undefined);
  }, [members]);

  const visible = useMemo(() => {
    const rows =
      filterRole === 'all'
        ? tasks
        : tasks.filter((t) => jobRoleOf(t.assigneeId) === filterRole);
    // Order: by status stage (todo → done), then by manual order.
    return [...rows].sort(
      (a, b) =>
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
        (a.order ?? 0) - (b.order ?? 0),
    );
  }, [tasks, filterRole, jobRoleOf]);

  const canChangeStatus = (t: Task) =>
    isAdmin || t.assigneeId === user?.uid || t.reporterId === user?.uid;

  function quickStatus(task: Task, status: TaskStatus) {
    if (status === task.status) return;
    void moveTask(task, status, task.order, selectedSprint?.name);
  }

  return (
    <div className="fade-in">
      <div className="view-header">
        <h1>{selectedSprint ? selectedSprint.name : 'Backlog'}</h1>
        <p>{selectedSprint?.goal || 'Danh sách công việc và tiến độ. Đổi trạng thái ngay ở cột phải.'}</p>
      </div>

      <div className="filter-bar">
        <span className="muted" style={{ fontSize: '0.85rem' }}>Bộ phận:</span>
        <select
          className="select"
          style={{ width: 'auto' }}
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value as JobRole | 'all')}
        >
          <option value="all">Tất cả</option>
          {JOB_ROLES.map((r) => (<option key={r.id} value={r.id}>{r.icon} {r.label}</option>))}
        </select>
        <span className="muted" style={{ fontSize: '0.8rem' }}>{visible.length} task</span>
      </div>

      {loading ? (
        <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
      ) : visible.length === 0 ? (
        <div className="glass empty">Không có task nào{filterRole !== 'all' ? ' cho bộ phận này' : ''}.</div>
      ) : (
        <div className="task-list">
          {visible.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              canChangeStatus={canChangeStatus(t)}
              onOpen={setEditing}
              onQuickStatus={quickStatus}
            />
          ))}
        </div>
      )}

      {editing && (
        <TaskModal task={editing} defaultSprintId={selectedSprintId} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
