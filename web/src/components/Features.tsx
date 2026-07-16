import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useProjectTasks } from '../hooks/useProjectTasks';
import { useFeatureLabels } from '../hooks/useFeatureLabels';
import { sortFeatureLabels } from '../lib/featureLabelSort';
import { becameDone, moveTask } from '../lib/taskWrites';
import { useNotify } from '../contexts/NotifyContext';
import { sortTasksByProgress } from '../lib/taskGrouping';
import TaskListRow from './TaskListRow';
import TaskModal from './TaskModal';
import FeatureModal from './FeatureModal';
import CreateTaskCard from './CreateTaskCard';
import BugLabelChip from './bug/BugLabelChip';
import type { Feature, FeatureKind, FeatureLabel, Task, TaskStatus } from '../types';

const DAY = 86_400_000;

/** Features tab: a card grid of the project's features; open one to see its tasks. */
export default function Features() {
  const { isAdmin } = useAuth();
  const { features, featuresLoading, selectedProjectId, selectedProject } = useSprintContext();
  const { tasks, loading: tasksLoading } = useProjectTasks(selectedProjectId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingFeature, setEditingFeature] = useState<Feature | null>(null);
  const [creating, setCreating] = useState(false);

  const { labels } = useFeatureLabels(selectedProjectId);
  const sortedLabels = useMemo(() => sortFeatureLabels(labels), [labels]);
  const labelById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  // Lọc: loại (Tất cả/Gói bán/Liên tục) + nhãn — feature phải mang ĐỦ các nhãn đã chọn.
  const [kindFilter, setKindFilter] = useState<'all' | FeatureKind>('all');
  const [filterLabelIds, setFilterLabelIds] = useState<string[]>([]);

  const projectFeatures = useMemo(
    () => features.filter((f) => f.projectId === selectedProjectId),
    [features, selectedProjectId],
  );
  const visibleFeatures = useMemo(
    () =>
      projectFeatures.filter(
        (f) =>
          (kindFilter === 'all' || f.kind === kindFilter) &&
          filterLabelIds.every((id) => f.labelIds.includes(id)),
      ),
    [projectFeatures, kindFilter, filterLabelIds],
  );

  /** done/total (+ done 30 ngày cho feature liên tục) — một vòng lặp cho tất cả. */
  const statsByFeature = useMemo(() => {
    const cutoff30 = Date.now() - 30 * DAY;
    const map = new Map<string, { done: number; total: number; done30: number }>();
    for (const t of tasks) {
      if (!t.featureId) continue;
      const s = map.get(t.featureId) ?? { done: 0, total: 0, done30: 0 };
      s.total += 1;
      if (t.status === 'done') {
        s.done += 1;
        // dueDate được reset về đúng ngày xong khi hoàn thành (xem DATA_MODEL).
        if ((t.dueDate?.toMillis() ?? 0) >= cutoff30) s.done30 += 1;
      }
      map.set(t.featureId, s);
    }
    return map;
  }, [tasks]);

  function toggleFilterLabel(id: string) {
    setFilterLabelIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  const selected = projectFeatures.find((f) => f.id === selectedId) ?? null;

  if (!selectedProjectId) {
    return <div className="glass empty">Hãy chọn một dự án trước.</div>;
  }

  if (selected) {
    return (
      <FeatureDetail
        feature={selected}
        labels={selected.labelIds
          .map((id) => labelById.get(id))
          .filter((l): l is FeatureLabel => Boolean(l))}
        // Truyền task xuống thay vì để con tự gọi useProjectTasks lần nữa: cùng projectId
        // sẽ sinh kênh realtime TRÙNG TÊN (`live:tasks:project_id=eq.<id>`) với kênh của
        // component này — hai channel cùng topic subscribe song song là hỏng realtime.
        tasks={tasks}
        loading={tasksLoading}
        onBack={() => setSelectedId(null)}
        onEdit={isAdmin ? () => setEditingFeature(selected) : undefined}
        editingFeature={editingFeature}
        onCloseEdit={() => setEditingFeature(null)}
      />
    );
  }

  if (featuresLoading) {
    return <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>;
  }

  return (
    <div className="fade-in">
      <div className="view-header">
        <h1>Features</h1>
        <p>Các hạng mục tính năng của {selectedProject?.name ?? 'dự án'}. Mỗi task gắn với một feature.</p>
      </div>

      {(sortedLabels.length > 0 || projectFeatures.length > 0) && (
        <div className="featflt">
          <div className="fk-pills sm">
            {([['all', 'Tất cả'], ['delivery', '🎯 Gói bán'], ['ongoing', '🔁 Liên tục']] as const).map(([k, lb]) => (
              <button
                key={k}
                type="button"
                className={`fk-pill${kindFilter === k ? ' on' : ''}`}
                onClick={() => setKindFilter(k)}
              >
                {lb}
              </button>
            ))}
          </div>
          {sortedLabels.length > 0 && (
            <div className="feat-chip-row">
              {sortedLabels.map((l) => (
                <BugLabelChip
                  key={l.id}
                  label={l}
                  small
                  active={filterLabelIds.includes(l.id)}
                  onClick={() => toggleFilterLabel(l.id)}
                />
              ))}
            </div>
          )}
          {(kindFilter !== 'all' || filterLabelIds.length > 0) && (
            <button className="btn-sm" onClick={() => { setKindFilter('all'); setFilterLabelIds([]); }}>
              Xoá lọc
            </button>
          )}
        </div>
      )}

      <div className="project-grid">
        {isAdmin && (
          <button className="project-card project-card-new" onClick={() => setCreating(true)}>
            <span className="project-new-plus">＋</span>
            <span>Tạo feature mới</span>
          </button>
        )}
        {visibleFeatures.map((f) => {
          const { done, total, done30 } = statsByFeature.get(f.id) ?? { done: 0, total: 0, done30: 0 };
          const percent = total === 0 ? 0 : Math.round((done / total) * 100);
          const chips = f.labelIds.map((id) => labelById.get(id)).filter((l): l is FeatureLabel => Boolean(l));
          return (
            <button key={f.id} className="project-card glass" onClick={() => setSelectedId(f.id)}>
              <span className="project-icon" style={{ background: `${f.color}22` }}>{f.icon}</span>
              <span className="project-name">{f.name}</span>
              {chips.length > 0 && (
                <span className="feat-chips">
                  {chips.map((l) => <BugLabelChip key={l.id} label={l} small />)}
                </span>
              )}
              {f.kind === 'ongoing' ? (
                // Feature liên tục không có "done" — % vô nghĩa, hiện nhịp làm thay thế.
                <span className="project-meta">🔁 {total - done} đang mở · {done30} xong /30 ngày</span>
              ) : (
                <>
                  <span className="project-meta">{done}/{total} task xong</span>
                  <span className="feat-prog">
                    <span className="progress"><span style={{ width: `${percent}%` }} /></span>
                    <span className="feat-pct mono">{percent}%</span>
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {projectFeatures.length === 0 && !isAdmin && (
        <div className="glass empty">Dự án này chưa có feature nào.</div>
      )}
      {projectFeatures.length > 0 && visibleFeatures.length === 0 && (
        <div className="glass empty">Không có feature nào khớp bộ lọc.</div>
      )}

      {creating && selectedProjectId && (
        <FeatureModal projectId={selectedProjectId} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}

interface DetailProps {
  feature: Feature;
  /** Nhãn của feature (đã resolve từ labelIds), do cha tra sẵn. */
  labels: FeatureLabel[];
  /** Task của cả project, do component cha fetch — xem chú thích ở chỗ gọi. */
  tasks: Task[];
  loading: boolean;
  onBack: () => void;
  onEdit?: () => void;
  editingFeature: Feature | null;
  onCloseEdit: () => void;
}

function FeatureDetail({ feature, labels, tasks, loading, onBack, onEdit, editingFeature, onCloseEdit }: DetailProps) {
  const { user, isAdmin } = useAuth();
  const { members, selectedSprintId } = useSprintContext();
  const { confirmDoneNotify } = useNotify();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);

  const jobRoleOf = useMemo(() => {
    const map = new Map(members.map((m) => [m.uid, m.jobRole]));
    return (uid: string | null) => (uid ? map.get(uid) : undefined);
  }, [members]);

  // Cùng thứ tự với Bảng Sprint: chưa xong lên trước, rồi tới thứ tự thủ công.
  const featureTasks = useMemo(
    () => sortTasksByProgress(tasks.filter((t) => t.featureId === feature.id)),
    [tasks, feature.id],
  );
  const canChangeStatus = (t: Task) => isAdmin || t.assigneeId === user?.uid || t.reporterId === user?.uid;

  function quickStatus(task: Task, status: TaskStatus) {
    if (status === task.status) return;
    const justFinished = becameDone(task.status, status);
    void moveTask(task, status, task.order);
    if (justFinished) confirmDoneNotify({ ...task, status });
  }

  return (
    <div className="fade-in">
      <div className="view-header row between">
        <div className="row" style={{ gap: '0.75rem' }}>
          <button className="btn-sm" onClick={onBack}>← Features</button>
          <h1 style={{ margin: 0 }}>{feature.icon} {feature.name}</h1>
          {feature.kind === 'ongoing' && <span className="fk-badge">🔁 Liên tục</span>}
        </div>
        {onEdit && <button className="btn-sm" onClick={onEdit}>Sửa</button>}
      </div>
      {labels.length > 0 && (
        <div className="feat-chip-row" style={{ marginBottom: '0.6rem' }}>
          {labels.map((l) => <BugLabelChip key={l.id} label={l} small />)}
        </div>
      )}
      {feature.description && <p className="muted" style={{ marginBottom: '1rem' }}>{feature.description}</p>}

      {loading ? (
        <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
      ) : (
        <>
          {isAdmin && (
            <CreateTaskCard variant="row" onClick={() => setCreatingTask(true)} label="Tạo task cho feature" />
          )}
          <div className="trow-list">
            {featureTasks.map((t) => (
              <TaskListRow
                key={t.id}
                task={t}
                assigneeJobRole={jobRoleOf(t.assigneeId) ?? undefined}
                canChangeStatus={canChangeStatus(t)}
                onOpen={setEditingTask}
                onQuickStatus={quickStatus}
              />
            ))}
          </div>
          {featureTasks.length === 0 && (
            <div className="glass empty">Feature này chưa có task.</div>
          )}
        </>
      )}

      {(editingTask || creatingTask) && (
        <TaskModal
          task={editingTask}
          defaultSprintId={editingTask?.sprintId ?? selectedSprintId}
          defaultProjectId={feature.projectId}
          defaultFeatureId={feature.id}
          onClose={() => { setEditingTask(null); setCreatingTask(false); }}
        />
      )}
      {editingFeature && (
        <FeatureModal feature={editingFeature} projectId={feature.projectId} onClose={onCloseEdit} />
      )}
    </div>
  );
}
