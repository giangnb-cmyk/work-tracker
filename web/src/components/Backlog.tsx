import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useProjectTasks } from '../hooks/useProjectTasks';
import { becameDone, moveTask } from '../lib/taskWrites';
import { useNotify } from '../contexts/NotifyContext';
import TaskRow from './TaskRow';
import TaskModal from './TaskModal';
import CreateTaskCard from './CreateTaskCard';
import type { Task, TaskStatus } from '../types';

/**
 * Backlog tab: parked tasks in the current project — created but not yet assigned
 * to anyone AND not pulled into any sprint. Pick them into a sprint / assign later
 * by opening the task.
 */
export default function Backlog() {
  const { user, isAdmin } = useAuth();
  const { members, selectedProjectId, selectedProject } = useSprintContext();
  const { confirmDoneNotify } = useNotify();
  const { tasks, loading } = useProjectTasks(selectedProjectId);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);

  const jobRoleOf = useMemo(() => {
    const map = new Map(members.map((m) => [m.uid, m.jobRole]));
    return (uid: string | null) => (uid ? map.get(uid) : undefined);
  }, [members]);

  const backlog = useMemo(
    () => tasks.filter((t) => !t.sprintId && !t.assigneeId),
    [tasks],
  );

  const canChangeStatus = (t: Task) => isAdmin || t.assigneeId === user?.uid || t.reporterId === user?.uid;

  function quickStatus(task: Task, status: TaskStatus) {
    if (status === task.status) return;
    const justFinished = becameDone(task.status, status);
    void moveTask(task, status, task.order);
    if (justFinished) confirmDoneNotify({ ...task, status });
  }

  if (!selectedProjectId) {
    return <div className="glass empty">Hãy chọn một dự án trước.</div>;
  }

  return (
    <div className="fade-in">
      <div className="view-header">
        <h1>📥 Backlog</h1>
        <p>Task đã tạo nhưng chưa giao ai và chưa vào sprint của {selectedProject?.name ?? 'dự án'}. Pick vào sprint khi cần.</p>
      </div>

      {loading ? (
        <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
      ) : (
        <div className="task-list">
          {isAdmin && <CreateTaskCard onClick={() => setCreating(true)} label="Thêm vào backlog" />}
          {backlog.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              assigneeJobRole={jobRoleOf(t.assigneeId) ?? undefined}
              canChangeStatus={canChangeStatus(t)}
              onOpen={setEditing}
              onQuickStatus={quickStatus}
            />
          ))}
          {backlog.length === 0 && !isAdmin && (
            <div className="glass empty">Backlog trống.</div>
          )}
        </div>
      )}

      {(editing || creating) && (
        <TaskModal
          task={editing}
          defaultSprintId={null}
          defaultProjectId={selectedProjectId}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
    </div>
  );
}
