import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useProjectTasks } from '../hooks/useProjectTasks';
import { useFeatureLabels } from '../hooks/useFeatureLabels';
import { sortFeatureLabels } from '../lib/featureLabelSort';
import { becameDone, moveTask, updateTask } from '../lib/taskWrites';
import { useNotify } from '../contexts/NotifyContext';
import { sortTasksByProgress } from '../lib/taskGrouping';
import TaskListRow from './TaskListRow';
import TaskModal from './TaskModal';
import FeatureModal from './FeatureModal';
import CreateTaskCard from './CreateTaskCard';
import BugLabelChip from './bug/BugLabelChip';
import { type FeaturePerson } from './FeatureAvatars';
import FeatureCard from './FeatureCard';
import FeatureTeamRow from './FeatureTeamRow';
import FeatureFilterBar, { isFeatureDone, matchFeature, type FeatureFilterToken } from './FeatureFilterBar';
import { groupFeaturesByVersion } from '../lib/featureGroups';
import { versionRangeChips, type VersionChip } from '../lib/versionRange';
import { labelGroup } from '../lib/bugLabelGroups';
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
  const { user, isAdmin, can } = useAuth();
  // Tạo feature: admin hoặc member được cấp 'feature.create' (RLS features_insert, 0034).
  // Sửa/xoá feature vẫn admin-only — quyền lẻ chỉ mở phần TẠO.
  const canCreate = can('feature.create');
  const {
    features, featuresLoading, selectedProjectId, selectedProject, selectedSprint, selectedSprintId, members,
  } = useSprintContext();
  const { tasks, loading: tasksLoading, refetch: refetchTasks } = useProjectTasks(selectedProjectId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingFeature, setEditingFeature] = useState<Feature | null>(null);
  const [creating, setCreating] = useState(false);
  /** Nhóm version đang xổ. Rỗng lúc đầu — effect bên dưới mở version cao nhất. */
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const autoOpened = useRef(false);

  const { labels, loading: labelsLoading } = useFeatureLabels(selectedProjectId);
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

  const groups = useMemo(() => groupFeaturesByVersion(visibleFeatures, labels), [visibleFeatures, labels]);

  /**
   * Vào tab thì mở sẵn version cao nhất — nhóm đầu tiên, vì groups đã sắp giảm dần.
   *
   * PHẢI chờ `labelsLoading` xong: palette chưa về thì KHÔNG nhãn version nào tồn tại,
   * mọi feature rơi hết vào nhóm "Chưa gắn version" — mở nhóm đó rồi cắm cờ autoOpened
   * là version cao nhất không bao giờ được mở nữa (nhóm rỗng kia còn biến mất, thành ra
   * đóng sạch). Chỉ chạy MỘT lần (ref): nếu không, mỗi lần lọc làm groups đổi là nó lại
   * bung nhóm đầu ra, đè lên thứ người dùng vừa tự đóng.
   */
  useEffect(() => {
    if (autoOpened.current || labelsLoading || groups.length === 0) return;
    autoOpened.current = true;
    setOpenKeys(new Set([groups[0].key]));
  }, [groups, labelsLoading]);

  function toggleGroup(key: string) {
    setOpenKeys((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  /**
   * Feature ĐANG chạy trong sprint đang chọn = có ít nhất một task thuộc sprint đó.
   * Suy từ task chứ không có liên kết sprint↔feature nào trong dữ liệu — và cũng đúng
   * hơn: "đang làm gì trong sprint này" chính là câu hỏi task trả lời.
   */
  const sprintFeatures = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tasks) {
      if (t.featureId && t.sprintId === selectedSprintId) ids.add(t.featureId);
    }
    // Lọc theo visibleFeatures để bộ lọc/tìm kiếm cũng ăn vào khối này.
    return visibleFeatures.filter((f) => ids.has(f.id));
  }, [tasks, selectedSprintId, visibleFeatures]);

  const ownLabelsOf = (f: Feature) =>
    f.labelIds.map((id) => labelById.get(id)).filter((l): l is FeatureLabel => Boolean(l));
  /** Nhãn nhóm (Shop, IAP…) — version tách ra vì còn phải gộp thành khoảng. */
  const groupChipsOf = (f: Feature) => ownLabelsOf(f).filter((l) => labelGroup(l.name) !== 'version');
  const versionChipsOf = (f: Feature) => versionRangeChips(ownLabelsOf(f), labels);

  /** Một card — dựng ở hai nơi (khối sprint và khối version) nên gom lại một chỗ. */
  function renderCard(f: Feature) {
    const stats = statsByFeature.get(f.id) ?? EMPTY_STATS;
    return (
      <FeatureCard
        key={f.id}
        feature={f}
        labels={groupChipsOf(f)}
        versions={versionChipsOf(f)}
        people={peopleByFeature.get(f.id) ?? EMPTY_PEOPLE}
        done={stats.done}
        total={stats.total}
        done30={stats.done30}
        // Cùng luật với facet "Tiến độ" của bộ lọc — thẻ tô xanh và bộ lọc "Hoàn thành"
        // phải chọn ra ĐÚNG một tập, lệch nhau là mất tin nhau.
        finished={isFeatureDone(f, stats)}
        onOpen={() => setSelectedId(f.id)}
      />
    );
  }

  /**
   * Đang lọc/tìm thì mở hết: nhóm đóng sẽ giấu đúng thứ vừa lọc ra, nhìn như bộ lọc
   * hỏng. Không đụng vào openKeys nên xoá lọc xong là các nhóm về đúng trạng thái cũ.
   */
  const filtering = tokens.length > 0 || query.trim().length > 0;
  const isGroupOpen = (key: string) => filtering || openKeys.has(key);

  const selected = projectFeatures.find((f) => f.id === selectedId) ?? null;

  if (!selectedProjectId) {
    return <div className="glass empty">Hãy chọn một dự án trước.</div>;
  }

  if (selected) {
    return (
      <FeatureDetail
        feature={selected}
        labels={groupChipsOf(selected)}
        versions={versionChipsOf(selected)}
        people={peopleByFeature.get(selected.id) ?? EMPTY_PEOPLE}
        // Truyền task xuống thay vì để con tự gọi useProjectTasks lần nữa. Trùng topic
        // realtime giờ đã vô hại (useLiveQuery tự thêm id riêng cho mỗi instance), nhưng
        // fetch lại y hệt bộ task đó vẫn là thừa — một query, một channel là đủ.
        tasks={tasks}
        loading={tasksLoading}
        refetchTasks={refetchTasks}
        onBack={() => setSelectedId(null)}
        onEdit={isAdmin ? () => setEditingFeature(selected) : undefined}
        editingFeature={editingFeature}
        onCloseEdit={() => setEditingFeature(null)}
      />
    );
  }

  // Chờ CẢ palette nhãn: thiếu nó thì lưới vẽ ra một nhóm "Chưa gắn version" ôm hết
  // feature, rồi nhãn về mới gom lại — người dùng thấy đúng một cú giật vô nghĩa.
  if (featuresLoading || labelsLoading) {
    return <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>;
  }

  return (
    <div className="fade-in">
      <div className="view-header row between">
        <div>
          <h1>Features</h1>
          <p>Các hạng mục tính năng của {selectedProject?.name ?? 'dự án'}, chia theo version.</p>
        </div>
        {canCreate && (
          <button className="btn-primary" onClick={() => setCreating(true)}>＋ Feature mới</button>
        )}
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

      {/* Đang làm gì trong sprint này — câu hỏi hay hỏi nhất, nên đứng trên cùng và
          KHÔNG gập lại. Feature ở đây vẫn xuất hiện lại trong khối version bên dưới:
          đây là hai câu hỏi khác nhau ("đang làm gì" vs "bản nào ship gì"). */}
      {sprintFeatures.length > 0 && (
        <section className="feat-sprint">
          <div className="mt-subhead">
            <h2>🎯 Feature trong sprint này</h2>
            <p className="muted">
              {selectedSprint?.name ?? 'Backlog'} · {sprintFeatures.length} feature đang có task
            </p>
          </div>
          <div className="project-grid">{sprintFeatures.map(renderCard)}</div>
        </section>
      )}

      <div className="mt-subhead">
        <h2>🏷️ Theo version</h2>
        <p className="muted">Xổ một bản ra để xem feature của bản đó.</p>
      </div>

      {groups.map((g) => {
        const open = isGroupOpen(g.key);
        const doneCount = g.features.filter((f) => isFeatureDone(f, statsByFeature.get(f.id) ?? EMPTY_STATS)).length;
        return (
          <section key={g.key} className="feat-group">
            <button
              className={`feat-group-head${open ? ' open' : ''}`}
              onClick={() => toggleGroup(g.key)}
              aria-expanded={open}
            >
              <span className="feat-group-caret" aria-hidden>{open ? '▾' : '▸'}</span>
              {g.label
                ? <BugLabelChip label={g.label} />
                : <span className="feat-group-none">Chưa gắn version</span>}
              <span className="feat-group-count">{g.features.length} feature</span>
              <span className="feat-group-done mono">{doneCount}/{g.features.length} xong</span>
            </button>

            {open && <div className="project-grid feat-group-grid">{g.features.map(renderCard)}</div>}
          </section>
        );
      })}

      {projectFeatures.length === 0 && (
        <div className="glass empty">
          {canCreate ? 'Dự án này chưa có feature nào — bấm “＋ Feature mới” ở trên.' : 'Dự án này chưa có feature nào.'}
        </div>
      )}
      {projectFeatures.length > 0 && groups.length === 0 && (
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
  /** Nhãn NHÓM của feature (đã resolve từ labelIds), do cha tra sẵn. */
  labels: FeatureLabel[];
  /** Chip version đã gộp khoảng (1.0.x → 1.5.x) — cùng cách hiện với card ngoài lưới. */
  versions: VersionChip[];
  /** Ai có task trong feature, nhiều task đứng trước — cha đã gộp sẵn từ cùng bộ task. */
  people: FeaturePerson[];
  /** Task của cả project, do component cha fetch — xem chú thích ở chỗ gọi. */
  tasks: Task[];
  loading: boolean;
  /** Nạp lại task ngay sau khi gắn task vào feature (khỏi đợi realtime). */
  refetchTasks: () => Promise<void>;
  onBack: () => void;
  onEdit?: () => void;
  editingFeature: Feature | null;
  onCloseEdit: () => void;
}

function FeatureDetail({
  feature, labels, versions, people, tasks, loading, refetchTasks, onBack, onEdit, editingFeature, onCloseEdit,
}: DetailProps) {
  const { user, isAdmin } = useAuth();
  const { members, features, selectedSprint, selectedSprintId } = useSprintContext();
  const { confirmDoneNotify } = useNotify();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [picking, setPicking] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

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

  const featureById = useMemo(() => new Map(features.map((f) => [f.id, f])), [features]);
  const featureNameOf = (id: string | null) => {
    const f = id ? featureById.get(id) : null;
    return f ? `${f.icon} ${f.name}` : '';
  };

  /**
   * Ứng viên để gắn: task Ở SPRINT ĐANG CHỌN, chưa nằm trong feature này. Tách hai nhóm —
   * CHƯA gắn feature lên trước (mục tiêu chính), rồi tới task đã thuộc feature khác (đổi
   * feature vẫn được). Cả hai giữ thứ tự "chưa xong lên trước" như danh sách chính.
   */
  const { unattached, otherFeature } = useMemo(() => {
    const inSprint = tasks.filter((t) => t.sprintId === selectedSprintId && t.featureId !== feature.id);
    return {
      unattached: sortTasksByProgress(inSprint.filter((t) => !t.featureId)),
      otherFeature: sortTasksByProgress(inSprint.filter((t) => t.featureId)),
    };
  }, [tasks, selectedSprintId, feature.id]);

  async function attach(task: Task) {
    setAttachError(null);
    try {
      await updateTask(task, { featureId: feature.id });
      await refetchTasks(); // task nhảy vào feature này NGAY, không đợi realtime
    } catch (err) {
      console.error('Gắn task vào feature thất bại', err);
      setAttachError('Gắn task thất bại (cần quyền admin).');
    }
  }

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
      {(labels.length > 0 || versions.length > 0) && (
        <div className="feat-chip-row feat-chips-lg" style={{ marginBottom: '0.6rem' }}>
          {labels.map((l) => <BugLabelChip key={l.id} label={l} />)}
          {versions.map((v) => <BugLabelChip key={v.key} label={v} />)}
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

          {isAdmin && (
            <div className="feat-attach">
              <button className="feat-attach-toggle" onClick={() => setPicking((p) => !p)} aria-expanded={picking}>
                <span className="feat-attach-caret" aria-hidden>{picking ? '▾' : '▸'}</span>
                Gắn task có sẵn từ {selectedSprint?.name ?? 'Backlog'}
              </button>
              {picking && (
                <div className="feat-attach-panel">
                  {unattached.length === 0 && otherFeature.length === 0 && (
                    <p className="feat-attach-empty muted">Sprint này không còn task nào để gắn.</p>
                  )}
                  {unattached.map((t) => (
                    <button key={t.id} className="feat-attach-row" onClick={() => attach(t)}>
                      <span className="feat-attach-title">{t.title}</span>
                      <span className="feat-attach-cta">＋ Gắn</span>
                    </button>
                  ))}
                  {otherFeature.length > 0 && (
                    <div className="feat-attach-divider">
                      Đang thuộc feature khác — bấm để chuyển sang “{feature.name}”
                    </div>
                  )}
                  {otherFeature.map((t) => (
                    <button key={t.id} className="feat-attach-row" onClick={() => attach(t)}>
                      <span className="feat-attach-title">{t.title}</span>
                      <span className="feat-attach-cur muted">{featureNameOf(t.featureId)}</span>
                      <span className="feat-attach-cta">Chuyển</span>
                    </button>
                  ))}
                  {attachError && <p className="error-text" style={{ padding: '0 0.5rem' }}>{attachError}</p>}
                </div>
              )}
            </div>
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
