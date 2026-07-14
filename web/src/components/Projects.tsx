import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useProjectTasks } from '../hooks/useProjectTasks';
import { becameDone, moveTask } from '../lib/taskWrites';
import { useNotify } from '../contexts/NotifyContext';
import { formatDate } from '../lib/format';
import TaskRow from './TaskRow';
import TaskModal from './TaskModal';
import ProjectModal from './ProjectModal';
import type { Project, Task, TaskStatus } from '../types';

/** Projects: a card grid (NotebookLM-style). Pick one to view its tasks. */
export default function Projects() {
  const { isAdmin } = useAuth();
  const { projects, projectsLoading } = useSprintContext();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);

  const selected = projects.find((p) => p.id === selectedId) ?? null;

  if (projectsLoading) {
    return (
      <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
    );
  }

  if (selected) {
    return (
      <ProjectDetail
        project={selected}
        onBack={() => setSelectedId(null)}
        onEdit={isAdmin ? () => setEditingProject(selected) : undefined}
        editingProject={editingProject}
        onCloseEdit={() => setEditingProject(null)}
      />
    );
  }

  return (
    <div className="fade-in">
      <div className="view-header">
        <h1>Dự án</h1>
        <p>Chọn một project để xem công việc bên trong.</p>
      </div>

      <div className="project-grid">
        {isAdmin && (
          <button className="project-card project-card-new" onClick={() => setCreating(true)}>
            <span className="project-new-plus">＋</span>
            <span>Tạo project mới</span>
          </button>
        )}
        {projects.map((p) => (
          <button key={p.id} className="project-card glass" onClick={() => setSelectedId(p.id)}>
            <span className="project-icon" style={{ background: `${p.color}22` }}>{p.icon}</span>
            <span className="project-name">{p.name}</span>
            <span className="project-meta">
              {p.notionProjectId ? '🔗 Notion · ' : ''}{formatDate(p.createdAt)}
            </span>
          </button>
        ))}
      </div>

      {projects.length === 0 && !isAdmin && (
        <div className="glass empty">Chưa có project nào.</div>
      )}

      {creating && <ProjectModal onClose={() => setCreating(false)} />}
    </div>
  );
}

interface DetailProps {
  project: Project;
  onBack: () => void;
  onEdit?: () => void;
  editingProject: Project | null;
  onCloseEdit: () => void;
}

function ProjectDetail({ project, onBack, onEdit, editingProject, onCloseEdit }: DetailProps) {
  const { user, isAdmin } = useAuth();
  const { members } = useSprintContext();
  const { confirmDoneNotify } = useNotify();
  const { tasks, loading } = useProjectTasks(project.id);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);

  const jobRoleOf = useMemo(() => {
    const map = new Map(members.map((m) => [m.uid, m.jobRole]));
    return (uid: string | null) => (uid ? map.get(uid) : undefined);
  }, [members]);

  const canChangeStatus = (t: Task) =>
    isAdmin || t.assigneeId === user?.uid || t.reporterId === user?.uid;

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
          <button className="btn-sm" onClick={onBack}>← Dự án</button>
          <h1 style={{ margin: 0 }}>{project.icon} {project.name}</h1>
        </div>
        <div className="row" style={{ gap: '0.5rem' }}>
          {onEdit && <button className="btn-sm" onClick={onEdit}>Sửa</button>}
          {isAdmin && <button className="btn-primary" onClick={() => setCreatingTask(true)}>+ Task</button>}
        </div>
      </div>
      {project.description && <p className="muted" style={{ marginBottom: '1rem' }}>{project.description}</p>}

      {loading ? (
        <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
      ) : tasks.length === 0 ? (
        <div className="glass empty">Project này chưa có task.</div>
      ) : (
        <div className="task-list">
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              assigneeJobRole={jobRoleOf(t.assigneeId) ?? undefined}
              canChangeStatus={canChangeStatus(t)}
              onOpen={setEditingTask}
              onQuickStatus={quickStatus}
            />
          ))}
        </div>
      )}

      {(editingTask || creatingTask) && (
        <TaskModal
          task={editingTask}
          defaultSprintId={editingTask?.sprintId ?? null}
          defaultProjectId={project.id}
          onClose={() => {
            setEditingTask(null);
            setCreatingTask(false);
          }}
        />
      )}
      {editingProject && <ProjectModal project={editingProject} onClose={onCloseEdit} />}
    </div>
  );
}
