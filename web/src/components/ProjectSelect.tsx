import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { formatDate } from '../lib/format';
import Avatar from './Avatar';
import ProjectModal from './ProjectModal';

/**
 * Landing page: pick a project before entering the app. Selecting one opens the
 * main workspace (Layout); the top-left icon there returns here.
 */
export default function ProjectSelect() {
  const { profile, isAdmin, signOut } = useAuth();
  const { projects, projectsLoading, selectProject } = useSprintContext();
  const [creating, setCreating] = useState(false);

  return (
    <div className="project-select">
      <header className="project-select-top">
        <div className="logo">
          <img className="mark-img" src="/IconGame.png" alt="" />
          <span>Work Tracker</span>
        </div>
        <div className="row" style={{ gap: '0.6rem' }}>
          <Avatar name={profile?.displayName ?? ''} photoURL={profile?.photoURL} size="sm" />
          <span className="muted" style={{ fontSize: '0.85rem' }}>{profile?.displayName}</span>
          <button className="btn-sm btn-signout" onClick={signOut}>Đăng xuất</button>
        </div>
      </header>

      <div className="project-select-body">
        <div className="view-header" style={{ textAlign: 'center' }}>
          <h1>Chọn dự án</h1>
          <p>Chọn một dự án để vào không gian làm việc.</p>
        </div>

        {projectsLoading ? (
          <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
        ) : (
          <div className="project-grid">
            {isAdmin && (
              <button className="project-card project-card-new" onClick={() => setCreating(true)}>
                <span className="project-new-plus">＋</span>
                <span>Tạo dự án mới</span>
              </button>
            )}
            {projects.map((p) => (
              <button key={p.id} className="project-card glass" onClick={() => selectProject(p.id)}>
                <span className="project-icon" style={{ background: `${p.color}22` }}>{p.icon}</span>
                <span className="project-name">{p.name}</span>
                <span className="project-meta">
                  {p.notionProjectId ? '🔗 Notion · ' : ''}{formatDate(p.createdAt)}
                </span>
              </button>
            ))}
            {projects.length === 0 && !isAdmin && (
              <div className="glass empty">Chưa có dự án nào. Nhờ admin tạo dự án nhé.</div>
            )}
          </div>
        )}
      </div>

      {creating && <ProjectModal onClose={() => setCreating(false)} />}
    </div>
  );
}
