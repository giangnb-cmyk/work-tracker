import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useMyTasks } from '../hooks/useMyTasks';
import { becameDone, moveTask } from '../lib/taskWrites';
import { useNotify } from '../contexts/NotifyContext';
import TaskRow from './TaskRow';
import TaskModal from './TaskModal';
import CreateTaskCard from './CreateTaskCard';
import type { Task, TaskStatus } from '../types';

/** The current user's tasks as a card grid (same card as the Sprint board). */
export default function MyTasks() {
  const { user } = useAuth();
  const { sprints, members, selectedSprintId, selectedProjectId } = useSprintContext();
  const { confirmDoneNotify } = useNotify();
  const { tasks, loading } = useMyTasks(user?.uid ?? '');
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);

  const jobRoleOf = useMemo(() => {
    const map = new Map(members.map((m) => [m.uid, m.jobRole]));
    return (uid: string | null) => (uid ? map.get(uid) : undefined);
  }, [members]);

  const sprintName = useMemo(() => {
    const map = new Map(sprints.map((s) => [s.id, s.name]));
    return (id: string | null) => (id ? map.get(id) ?? '—' : 'Backlog');
  }, [sprints]);

  // Open first, then done.
  const ordered = useMemo(
    () => [...tasks].sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done')),
    [tasks],
  );
  const open = tasks.filter((t) => t.status !== 'done').length;

  function quickStatus(task: Task, status: TaskStatus) {
    if (status === task.status) return;
    const justFinished = becameDone(task.status, status);
    void moveTask(task, status, task.order);
    if (justFinished) confirmDoneNotify({ ...task, status }, sprintName(task.sprintId));
  }

  if (loading) {
    return (
      <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
    );
  }

  return (
    <div className="fade-in">
      <div className="view-header">
        <h1>Task của tôi</h1>
        <p>{open} task đang mở · {tasks.length - open} đã xong.</p>
      </div>

      <div className="task-list">
        <CreateTaskCard onClick={() => setCreating(true)} label="Tạo task cho tôi" />
        {ordered.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            assigneeJobRole={jobRoleOf(t.assigneeId) ?? undefined}
            canChangeStatus
            onOpen={setEditing}
            onQuickStatus={quickStatus}
          />
        ))}
      </div>

      {(editing || creating) && (
        <TaskModal
          task={editing}
          defaultSprintId={editing?.sprintId ?? selectedSprintId}
          defaultProjectId={selectedProjectId}
          defaultAssigneeId={creating ? user?.uid ?? null : null}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}
