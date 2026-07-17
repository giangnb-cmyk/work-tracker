import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useProjectTasks } from '../hooks/useProjectTasks';
import { useStoredView } from '../hooks/useStoredView';
import { becameDone, moveTask } from '../lib/taskWrites';
import { useNotify } from '../contexts/NotifyContext';
import TaskRow from './TaskRow';
import TaskListRow from './TaskListRow';
import TaskModal from './TaskModal';
import CreateTaskCard from './CreateTaskCard';
import type { Task, TaskStatus } from '../types';

type ViewMode = 'list' | 'gallery';

const VIEW_MODES: readonly ViewMode[] = ['list', 'gallery'];
/** Nhớ kiểu xem qua các lần vào — sở thích cá nhân, không phải trạng thái phiên.
 *  Khoá riêng khỏi 'myTasksView': hai tab, hai thói quen xem khác nhau. */
const MODE_KEY = 'backlogView';

/**
 * Backlog tab: parked tasks in the current project — created but not yet assigned
 * to anyone AND not pulled into any sprint. Pick them into a sprint / assign later
 * by opening the task. Xem dạng danh sách hoặc thẻ (gallery).
 */
export default function Backlog() {
  const { user, isAdmin } = useAuth();
  const { members, selectedProjectId, selectedProject } = useSprintContext();
  const { confirmDoneNotify } = useNotify();
  const { tasks, loading } = useProjectTasks(selectedProjectId);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [mode, selectMode] = useStoredView<ViewMode>(MODE_KEY, VIEW_MODES, 'list');

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
      <div className="view-header row between">
        <div>
          <h1>📥 Backlog</h1>
          <p>
            {backlog.length} task đã tạo nhưng chưa giao ai và chưa vào sprint của{' '}
            {selectedProject?.name ?? 'dự án'}. Pick vào sprint khi cần.
          </p>
        </div>
        <div className="seg-toggle" role="group" aria-label="Kiểu hiển thị">
          <button className={`seg${mode === 'list' ? ' on' : ''}`} onClick={() => selectMode('list')}>
            Danh sách
          </button>
          <button className={`seg${mode === 'gallery' ? ' on' : ''}`} onClick={() => selectMode('gallery')}>
            Gallery
          </button>
        </div>
      </div>

      {loading ? (
        <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
      ) : mode === 'gallery' ? (
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
          {backlog.length === 0 && !isAdmin && <div className="glass empty">Backlog trống.</div>}
        </div>
      ) : (
        <>
          {isAdmin && (
            <CreateTaskCard variant="row" onClick={() => setCreating(true)} label="Thêm vào backlog" />
          )}
          <div className="trow-list">
            {backlog.map((t) => (
              <TaskListRow
                key={t.id}
                task={t}
                assigneeJobRole={jobRoleOf(t.assigneeId) ?? undefined}
                canChangeStatus={canChangeStatus(t)}
                onOpen={setEditing}
                onQuickStatus={quickStatus}
                // Backlog theo định nghĩa là task CHƯA GIAO — cột người nhận rỗng cả bảng.
                showAssignee={false}
              />
            ))}
          </div>
          {backlog.length === 0 && <div className="glass empty">Backlog trống.</div>}
        </>
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
