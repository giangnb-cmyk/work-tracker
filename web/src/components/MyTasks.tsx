import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useMyTasks } from '../hooks/useMyTasks';
import { useMyBugs } from '../hooks/useMyBugs';
import { useBugLabels } from '../hooks/useBugLabels';
import { becameDone, moveTask } from '../lib/taskWrites';
import { useNotify } from '../contexts/NotifyContext';
import TaskRow from './TaskRow';
import TaskListRow from './TaskListRow';
import TaskModal from './TaskModal';
import CreateTaskCard from './CreateTaskCard';
import BugList from './bug/BugList';
import BugModal from './bug/BugModal';
import type { Bug, Task, TaskStatus } from '../types';

type ViewMode = 'list' | 'gallery';
/** Nhớ kiểu xem qua các lần vào — đây là sở thích cá nhân, không phải trạng thái phiên. */
const MODE_KEY = 'myTasksView';

/** Task + bug của người đang đăng nhập — xem dạng danh sách hoặc dạng thẻ (gallery). */
export default function MyTasks() {
  const { user } = useAuth();
  const { sprints, members, selectedSprintId, selectedProjectId, selectedProject } = useSprintContext();
  const { confirmDoneNotify } = useNotify();
  const { tasks, loading } = useMyTasks(user?.uid ?? '');
  const { bugs } = useMyBugs(user?.uid ?? '', selectedProjectId);
  const { labels } = useBugLabels(selectedProjectId);
  const [editing, setEditing] = useState<Task | null>(null);
  const [editingBug, setEditingBug] = useState<Bug | null>(null);
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<ViewMode>(
    () => (localStorage.getItem(MODE_KEY) === 'gallery' ? 'gallery' : 'list'),
  );

  function selectMode(next: ViewMode) {
    localStorage.setItem(MODE_KEY, next);
    setMode(next);
  }

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

  const labelsById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const openBugs = bugs.filter((b) => b.status !== 'done').length;

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
      <div className="view-header row between">
        <div>
          <h1>Task của tôi</h1>
          <p>{open} task đang mở · {tasks.length - open} đã xong.</p>
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

      {mode === 'gallery' ? (
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
      ) : (
        <>
          <CreateTaskCard variant="row" onClick={() => setCreating(true)} label="Tạo task cho tôi" />
          <div className="trow-list">
            {ordered.map((t) => (
              <TaskListRow
                key={t.id}
                task={t}
                assigneeJobRole={jobRoleOf(t.assigneeId) ?? undefined}
                canChangeStatus
                onOpen={setEditing}
                onQuickStatus={quickStatus}
                // Task của chính mình — cột người nhận chỉ lặp lại một cái tên.
                showAssignee={false}
              />
            ))}
          </div>
          {ordered.length === 0 && <div className="glass empty">Bạn chưa có task nào.</div>}
        </>
      )}

      {/* Bug được giao — tách hẳn khỏi task, tiêu đề riêng cho dễ nhìn. */}
      {bugs.length > 0 && (
        <section className="mt-bugs">
          <div className="mt-subhead">
            <h2>🐞 Bug được giao</h2>
            <p className="muted">
              {openBugs} bug đang mở · {bugs.length - openBugs} đã xong · {selectedProject?.name ?? 'dự án'}
            </p>
          </div>
          <BugList
            bugs={bugs}
            labelsById={labelsById}
            projectName={selectedProject?.name ?? ''}
            onOpen={setEditingBug}
          />
        </section>
      )}

      {editingBug && selectedProjectId && (
        <BugModal
          bug={editingBug}
          projectId={selectedProjectId}
          labels={labels}
          onClose={() => setEditingBug(null)}
        />
      )}

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
