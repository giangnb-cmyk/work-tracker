import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useProjectTasks } from '../hooks/useProjectTasks';
import { becameDone, moveTask } from '../lib/taskWrites';
import { useNotify } from '../contexts/NotifyContext';
import TaskRow from './TaskRow';
import TaskModal from './TaskModal';
import FeatureModal from './FeatureModal';
import CreateTaskCard from './CreateTaskCard';
import type { Feature, Task, TaskStatus } from '../types';

/** Features tab: a card grid of the project's features; open one to see its tasks. */
export default function Features() {
  const { isAdmin } = useAuth();
  const { features, featuresLoading, selectedProjectId, selectedProject } = useSprintContext();
  const { tasks } = useProjectTasks(selectedProjectId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingFeature, setEditingFeature] = useState<Feature | null>(null);
  const [creating, setCreating] = useState(false);

  const projectFeatures = useMemo(
    () => features.filter((f) => f.projectId === selectedProjectId),
    [features, selectedProjectId],
  );
  const countByFeature = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) if (t.featureId) map.set(t.featureId, (map.get(t.featureId) ?? 0) + 1);
    return map;
  }, [tasks]);

  const selected = projectFeatures.find((f) => f.id === selectedId) ?? null;

  if (!selectedProjectId) {
    return <div className="glass empty">Hãy chọn một dự án trước.</div>;
  }

  if (selected) {
    return (
      <FeatureDetail
        feature={selected}
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

      <div className="project-grid">
        {isAdmin && (
          <button className="project-card project-card-new" onClick={() => setCreating(true)}>
            <span className="project-new-plus">＋</span>
            <span>Tạo feature mới</span>
          </button>
        )}
        {projectFeatures.map((f) => (
          <button key={f.id} className="project-card glass" onClick={() => setSelectedId(f.id)}>
            <span className="project-icon" style={{ background: `${f.color}22` }}>{f.icon}</span>
            <span className="project-name">{f.name}</span>
            <span className="project-meta">{countByFeature.get(f.id) ?? 0} task</span>
          </button>
        ))}
      </div>

      {projectFeatures.length === 0 && !isAdmin && (
        <div className="glass empty">Dự án này chưa có feature nào.</div>
      )}

      {creating && selectedProjectId && (
        <FeatureModal projectId={selectedProjectId} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}

interface DetailProps {
  feature: Feature;
  onBack: () => void;
  onEdit?: () => void;
  editingFeature: Feature | null;
  onCloseEdit: () => void;
}

function FeatureDetail({ feature, onBack, onEdit, editingFeature, onCloseEdit }: DetailProps) {
  const { user, isAdmin } = useAuth();
  const { members, selectedSprintId } = useSprintContext();
  const { confirmDoneNotify } = useNotify();
  const { tasks, loading } = useProjectTasks(feature.projectId);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);

  const jobRoleOf = useMemo(() => {
    const map = new Map(members.map((m) => [m.uid, m.jobRole]));
    return (uid: string | null) => (uid ? map.get(uid) : undefined);
  }, [members]);

  const featureTasks = useMemo(() => tasks.filter((t) => t.featureId === feature.id), [tasks, feature.id]);
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
        </div>
        {onEdit && <button className="btn-sm" onClick={onEdit}>Sửa</button>}
      </div>
      {feature.description && <p className="muted" style={{ marginBottom: '1rem' }}>{feature.description}</p>}

      {loading ? (
        <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
      ) : (
        <div className="task-list">
          {isAdmin && <CreateTaskCard onClick={() => setCreatingTask(true)} label="Tạo task cho feature" />}
          {featureTasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              assigneeJobRole={jobRoleOf(t.assigneeId) ?? undefined}
              canChangeStatus={canChangeStatus(t)}
              onOpen={setEditingTask}
              onQuickStatus={quickStatus}
            />
          ))}
          {featureTasks.length === 0 && !isAdmin && (
            <div className="glass empty">Feature này chưa có task.</div>
          )}
        </div>
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
