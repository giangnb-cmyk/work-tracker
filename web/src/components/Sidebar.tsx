import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import Avatar from './Avatar';

// 'projects' is no longer an in-app tab — it's the landing page you enter through.
export type ViewId = 'board' | 'mytasks' | 'features' | 'backlog' | 'bugs' | 'timeline' | 'dashboard' | 'sprints' | 'team' | 'settings';

interface NavDef {
  id: ViewId;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const NAV: NavDef[] = [
  { id: 'board', label: 'Bảng Sprint', icon: '📋' },
  { id: 'mytasks', label: 'Task của tôi', icon: '🎯' },
  { id: 'features', label: 'Features', icon: '🧩' },
  { id: 'backlog', label: 'Backlog', icon: '📥' },
  { id: 'bugs', label: 'Bugs', icon: '🐞' },
  { id: 'timeline', label: 'Timeline', icon: '📆' },
  { id: 'dashboard', label: 'Thống kê', icon: '📊' },
  { id: 'sprints', label: 'Quản lý Sprint', icon: '🗂️', adminOnly: true },
  { id: 'team', label: 'Thành viên', icon: '👥' },
  { id: 'settings', label: 'Cấu hình', icon: '⚙️', adminOnly: true },
];

interface SidebarProps {
  active: ViewId;
  onSelect: (v: ViewId) => void;
}

export default function Sidebar({ active, onSelect }: SidebarProps) {
  const { profile, isAdmin, signOut } = useAuth();
  const { selectedProject, selectProject } = useSprintContext();

  return (
    <aside className="sidebar">
      {/* Top-left: click to go back to the project-selection landing page. */}
      <button className="project-back" onClick={() => selectProject(null)} title="Về trang chọn dự án">
        <span className="back-arrow">←</span>
        <span className="project-back-icon">{selectedProject?.icon ?? '📁'}</span>
        <span className="project-back-name">{selectedProject?.name ?? 'Dự án'}</span>
      </button>

      {NAV.filter((n) => !n.adminOnly || isAdmin).map((n) => (
        <button
          key={n.id}
          className={`nav-item${active === n.id ? ' active' : ''}`}
          onClick={() => onSelect(n.id)}
        >
          <span className="icon">{n.icon}</span>
          {n.label}
        </button>
      ))}

      <div className="sidebar-footer">
        <div className="row" style={{ padding: '0.5rem' }}>
          <Avatar name={profile?.displayName ?? ''} photoURL={profile?.photoURL} size="sm" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {profile?.displayName}
            </div>
            <div className="muted" style={{ fontSize: '0.7rem' }}>
              {isAdmin ? 'Admin' : 'Thành viên'}
            </div>
          </div>
        </div>
        <button className="btn-sm" style={{ width: '100%', marginTop: '0.4rem' }} onClick={signOut}>
          Đăng xuất
        </button>
      </div>
    </aside>
  );
}
