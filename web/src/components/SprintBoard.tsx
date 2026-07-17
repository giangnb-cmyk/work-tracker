import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useTasks } from '../hooks/useTasks';
import { useSprintHistory } from '../hooks/useSprintHistory';
import { becameDone, moveTask } from '../lib/taskWrites';
import { useNotify } from '../contexts/NotifyContext';
import { groupTasksByDept } from '../lib/taskGrouping';
import TaskListRow from './TaskListRow';
import TaskModal from './TaskModal';
import MeetingNoteModal from './MeetingNoteModal';
import MoveSprintModal from './task/MoveSprintModal';
import CreateTaskCard from './CreateTaskCard';
import TaskFilterBar, { matchTask, type TaskFilterToken } from './TaskFilterBar';
import type { Task, TaskStatus } from '../types';

/**
 * Sprint task LIST (not Kanban — the team is lazy about moving cards).
 *
 * Vẫn chia SẴN theo bộ phận: vào là thấy ngay phần việc của từng bộ phận, không phải bấm
 * lọc rồi bấm lại để so. Thứ tự mục cố định theo JOB_ROLES nên không nhảy chỗ giữa các
 * sprint. Bộ lọc chỉ THU HẸP tập task rồi mới chia nhóm — hai thứ bù nhau chứ không thay
 * nhau, nên sprint đông task vẫn soi được mà cái nhìn tổng vẫn còn.
 */
export default function SprintBoard() {
  const { user, isAdmin } = useAuth();
  const { selectedSprintId, selectedSprint, selectedProjectId, members, sprints, features } =
    useSprintContext();
  const { confirmDoneNotify } = useNotify();
  const { tasks, loading } = useTasks(selectedSprintId);
  const { everTasks } = useSprintHistory(selectedSprintId);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState<Task | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [tokens, setTokens] = useState<TaskFilterToken[]>([]);
  const [query, setQuery] = useState('');

  // Task từng thuộc sprint này nhưng đã được chuyển đi làm tiếp ở sprint khác.
  const carriedAway = useMemo(
    () =>
      everTasks.filter((t) => t.projectId === selectedProjectId && t.sprintId !== selectedSprintId),
    [everTasks, selectedProjectId, selectedSprintId],
  );
  const sprintNameOf = useMemo(() => {
    const byId = new Map(sprints.map((s) => [s.id, s.name]));
    return (id: string | null) => (id ? byId.get(id) ?? 'sprint khác' : 'Backlog');
  }, [sprints]);
  // uid → jobRole, để gắn icon chuyên môn lên từng dòng.
  const jobRoleOf = useMemo(() => {
    const map = new Map(members.map((m) => [m.uid, m.jobRole]));
    return (uid: string | null) => (uid ? map.get(uid) : undefined);
  }, [members]);

  const projectTasks = useMemo(
    () => tasks.filter((t) => t.projectId === selectedProjectId),
    [tasks, selectedProjectId],
  );
  // Feature của đúng dự án đang chọn — đưa vào bộ lọc thì đừng liệt kê feature dự án khác.
  const projectFeatures = useMemo(
    () => features.filter((f) => f.projectId === selectedProjectId),
    [features, selectedProjectId],
  );
  const meId = user?.uid ?? '';
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projectTasks.filter(
      (t) => (!q || t.title.toLowerCase().includes(q)) && matchTask(t, tokens, meId),
    );
  }, [projectTasks, query, tokens, meId]);
  // Chia nhóm SAU khi lọc: nhóm nào lọc hết task thì tự biến mất, khỏi để lại mục rỗng.
  const groups = useMemo(() => groupTasksByDept(shown, members), [shown, members]);
  const filtering = tokens.length > 0 || query.trim() !== '';

  const canChangeStatus = (t: Task) =>
    isAdmin || t.assigneeId === user?.uid || t.reporterId === user?.uid;

  function quickStatus(task: Task, status: TaskStatus) {
    if (status === task.status) return;
    const justFinished = becameDone(task.status, status);
    void moveTask(task, status, task.order);
    if (justFinished) confirmDoneNotify({ ...task, status }, selectedSprint?.name);
  }

  return (
    <div className="fade-in">
      <div className="view-header row between">
        <div>
          <h1>{selectedSprint ? selectedSprint.name : 'Backlog'}</h1>
          <p>{selectedSprint?.goal || 'Danh sách công việc và tiến độ. Đổi trạng thái ngay ở cột phải.'}</p>
        </div>
        {groups.length > 0 && (
          <button className="btn-sm" onClick={() => setNoteOpen(true)} title="Xuất danh sách theo bộ phận để dán vào note họp">
            📋 Note họp
          </button>
        )}
      </div>

      {loading ? (
        <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
      ) : (
        <>
          {projectTasks.length > 0 && (
            <TaskFilterBar
              features={projectFeatures}
              members={members}
              tokens={tokens}
              onTokens={setTokens}
              query={query}
              onQuery={setQuery}
            />
          )}
          {isAdmin && <CreateTaskCard variant="row" onClick={() => setCreating(true)} />}

          {groups.map((g) => (
            <section key={g.key} className="dept-group">
              <div className="dept-head">
                <span className="dept-icon">{g.icon}</span>
                <h3 className="dept-name">{g.label}</h3>
                <span className="dept-count mono">{g.done}/{g.tasks.length}</span>
              </div>
              <div className="trow-list">
                {g.tasks.map((t) => (
                  <TaskListRow
                    key={t.id}
                    task={t}
                    assigneeJobRole={jobRoleOf(t.assigneeId) ?? undefined}
                    canChangeStatus={canChangeStatus(t)}
                    onOpen={setEditing}
                    onQuickStatus={quickStatus}
                    onMoveSprint={selectedSprintId && canChangeStatus(t) ? setMoving : undefined}
                  />
                ))}
              </div>
            </section>
          ))}

          {/* Phân biệt "chưa có task" với "lọc không ra": cùng một màn trống mà hai
              nguyên nhân khác hẳn — nói nhầm là người dùng đi tạo task trong khi chỉ cần
              xoá bộ lọc. */}
          {groups.length === 0 && (
            <div className="glass empty">
              {filtering ? 'Không có task nào khớp bộ lọc.' : 'Sprint này chưa có task nào.'}
            </div>
          )}
        </>
      )}

      {carriedAway.length > 0 && (
        <details className="carried glass">
          <summary>Đã chuyển sang sprint khác ({carriedAway.length})</summary>
          <p className="muted" style={{ fontSize: '0.78rem', margin: '0 0 0.6rem' }}>
            Task từng thuộc sprint này nhưng chưa xong nên được sprint sau làm tiếp. Vẫn tính vào
            số liệu trễ của sprint này.
          </p>
          {carriedAway.map((t) => (
            <button key={t.id} className="carried-row" onClick={() => setEditing(t)}>
              <span className="carried-title">{t.title}</span>
              <span className="muted" style={{ fontSize: '0.8rem' }}>{t.assigneeName || 'Chưa giao'}</span>
              <span className="badge status-completed">→ {sprintNameOf(t.sprintId)}</span>
            </button>
          ))}
        </details>
      )}

      {(editing || creating) && (
        <TaskModal
          task={editing}
          defaultSprintId={selectedSprintId}
          defaultProjectId={selectedProjectId}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}

      {moving && <MoveSprintModal task={moving} onClose={() => setMoving(null)} />}

      {noteOpen && (
        <MeetingNoteModal
          title={selectedSprint?.name ?? 'Backlog'}
          groups={groups}
          onClose={() => setNoteOpen(false)}
        />
      )}
    </div>
  );
}
