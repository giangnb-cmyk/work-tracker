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
import FeatureAvatars, { type FeaturePerson } from './FeatureAvatars';
import FeatureTeamRow from './FeatureTeamRow';
import FeatureFilterBar, { isFeatureDone, matchFeature, type FeatureFilterToken } from './FeatureFilterBar';
import { CheckCircleIcon } from './icons';
import type { Feature, FeatureLabel, Task, TaskStatus } from '../types';

const DAY = 86_400_000;

/** Số liệu một feature — gộp trong đúng một vòng lặp qua tasks. */
interface FeatureStats {
  done: number;
  total: number;
  done30: number;
  /** uid → số task + tên đã denormalize trên task (còn dùng được cả khi member bị xoá). */
  byUid: Map<string, { count: number; name: string }>;
}

// Feature chưa có task nào. Dùng chung cho cả card lẫn bộ lọc: khỏi tạo object mới mỗi
// lần render một card / xét một feature.
const EMPTY_STATS: FeatureStats = { done: 0, total: 0, done30: 0, byUid: new Map() };
const EMPTY_PEOPLE: FeaturePerson[] = [];

/** Features tab: a card grid of the project's features; open one to see its tasks. */
export default function Features() {
  const { user, isAdmin } = useAuth();
  const { features, featuresLoading, selectedProjectId, selectedProject, members } = useSprintContext();
  const { tasks, loading: tasksLoading } = useProjectTasks(selectedProjectId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingFeature, setEditingFeature] = useState<Feature | null>(null);
  const [creating, setCreating] = useState(false);

  const { labels } = useFeatureLabels(selectedProjectId);
  const sortedLabels = useMemo(() => sortFeatureLabels(labels), [labels]);
  const labelById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  // Lọc token như tab Bugs: loại / nhãn / version / người làm + tìm theo tên.
  const [tokens, setTokens] = useState<FeatureFilterToken[]>([]);
  const [query, setQuery] = useState('');
  const meId = user?.uid ?? '';

  const projectFeatures = useMemo(
    () => features.filter((f) => f.projectId === selectedProjectId),
    [features, selectedProjectId],
  );

  /** done/total (+ done 30 ngày cho feature liên tục) + ai đang gánh — một vòng lặp cho tất cả. */
  const statsByFeature = useMemo(() => {
    const cutoff30 = Date.now() - 30 * DAY;
    const map = new Map<string, FeatureStats>();
    for (const t of tasks) {
      if (!t.featureId) continue;
      let s = map.get(t.featureId);
      if (!s) {
        s = { done: 0, total: 0, done30: 0, byUid: new Map() };
        map.set(t.featureId, s);
      }
      s.total += 1;
      if (t.status === 'done') {
        s.done += 1;
        // dueDate được reset về đúng ngày xong khi hoàn thành (xem DATA_MODEL).
        if ((t.dueDate?.toMillis() ?? 0) >= cutoff30) s.done30 += 1;
      }
      if (!t.assigneeId) continue;
      const p = s.byUid.get(t.assigneeId);
      if (p) p.count += 1;
      else s.byUid.set(t.assigneeId, { count: 1, name: t.assigneeName });
    }
    return map;
  }, [tasks]);

  /**
   * Người có task trong feature, ai nhiều task đứng trước.
   * Ảnh/tên ưu tiên lấy từ `members` (mới nhất), rơi về tên denormalize trên task khi
   * người đó không còn trong danh sách member — card vẫn hiện chữ cái đầu thay vì trống.
   */
  const peopleByFeature = useMemo(() => {
    const memberByUid = new Map(members.map((m) => [m.uid, m]));
    const out = new Map<string, FeaturePerson[]>();
    for (const [featureId, s] of statsByFeature) {
      const people: FeaturePerson[] = [];
      for (const [uid, { count, name }] of s.byUid) {
        const m = memberByUid.get(uid);
        people.push({ uid, count, name: m?.displayName || name, photoURL: m?.photoURL });
      }
      people.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'));
      out.set(featureId, people);
    }
    return out;
  }, [statsByFeature, members]);

  // Sau statsByFeature: facet "tiến độ" và "người làm" lọc trên chính số liệu gộp từ task.
  const visibleFeatures = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projectFeatures.filter((f) => {
      if (!matchFeature(f, tokens, statsByFeature.get(f.id) ?? EMPTY_STATS, meId)) return false;
      return !q || f.name.toLowerCase().includes(q);
    });
  }, [projectFeatures, tokens, query, statsByFeature, meId]);

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
        people={peopleByFeature.get(selected.id) ?? EMPTY_PEOPLE}
        // Truyền task xuống thay vì để con tự gọi useProjectTasks lần nữa. Trùng topic
        // realtime giờ đã vô hại (useLiveQuery tự thêm id riêng cho mỗi instance), nhưng
        // fetch lại y hệt bộ task đó vẫn là thừa — một query, một channel là đủ.
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

      {projectFeatures.length > 0 && (
        <FeatureFilterBar
          labels={sortedLabels}
          members={members}
          tokens={tokens}
          onTokens={setTokens}
          query={query}
          onQuery={setQuery}
        />
      )}

      <div className="project-grid">
        {isAdmin && (
          <button className="project-card project-card-new" onClick={() => setCreating(true)}>
            <span className="project-new-plus">＋</span>
            <span>Tạo feature mới</span>
          </button>
        )}
        {visibleFeatures.map((f) => {
          const stats = statsByFeature.get(f.id) ?? EMPTY_STATS;
          const { done, total, done30 } = stats;
          const percent = total === 0 ? 0 : Math.round((done / total) * 100);
          // Cùng luật với facet "Tiến độ" của bộ lọc — thẻ tô xanh và bộ lọc "Hoàn thành"
          // phải chọn ra ĐÚNG một tập, lệch nhau là mất tin nhau.
          const finished = isFeatureDone(f, stats);
          const chips = f.labelIds.map((id) => labelById.get(id)).filter((l): l is FeatureLabel => Boolean(l));
          return (
            <button
              key={f.id}
              className={`project-card feat-card glass${finished ? ' done' : ''}`}
              onClick={() => setSelectedId(f.id)}
            >
              {finished && (
                <span className="feat-done-mark" title="Đã hoàn thành" aria-label="Đã hoàn thành">
                  <CheckCircleIcon size={20} />
                </span>
              )}
              <span className="project-icon" style={{ background: `${f.color}22` }}>{f.icon}</span>
              <span className="project-name">{f.name}</span>
              {chips.length > 0 && (
                <span className="feat-chips feat-chips-lg">
                  {chips.map((l) => <BugLabelChip key={l.id} label={l} />)}
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
              <FeatureAvatars people={peopleByFeature.get(f.id) ?? EMPTY_PEOPLE} />
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
  /** Ai có task trong feature, nhiều task đứng trước — cha đã gộp sẵn từ cùng bộ task. */
  people: FeaturePerson[];
  /** Task của cả project, do component cha fetch — xem chú thích ở chỗ gọi. */
  tasks: Task[];
  loading: boolean;
  onBack: () => void;
  onEdit?: () => void;
  editingFeature: Feature | null;
  onCloseEdit: () => void;
}

function FeatureDetail({ feature, labels, people, tasks, loading, onBack, onEdit, editingFeature, onCloseEdit }: DetailProps) {
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
        <div className="feat-chip-row feat-chips-lg" style={{ marginBottom: '0.6rem' }}>
          {labels.map((l) => <BugLabelChip key={l.id} label={l} />)}
        </div>
      )}
      <FeatureTeamRow people={people} />
      {feature.description && (
        <div className="feat-block">
          <span className="feat-cap">Description</span>
          <p className="muted feat-desc">{feature.description}</p>
        </div>
      )}

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
