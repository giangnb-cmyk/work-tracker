import { useAuth } from '../contexts/AuthContext';
import Avatar from './Avatar';

export type ViewId = 'board' | 'mytasks' | 'dashboard' | 'sprints' | 'team';

interface NavDef {
  id: ViewId;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const NAV: NavDef[] = [
  { id: 'board', label: 'Bảng Sprint', icon: '📋' },
  { id: 'mytasks', label: 'Task của tôi', icon: '🎯' },
  { id: 'dashboard', label: 'Thống kê', icon: '📊' },
  { id: 'sprints', label: 'Quản lý Sprint', icon: '🗂️', adminOnly: true },
  { id: 'team', label: 'Thành viên', icon: '👥' },
];

interface SidebarProps {
  active: ViewId;
  onSelect: (v: ViewId) => void;
}

export default function Sidebar({ active, onSelect }: SidebarProps) {
  const { profile, isAdmin, signOut } = useAuth();

  return (
    <aside className="sidebar">
      <div className="logo">
        <span className="mark">✅</span>
        <span>Work Tracker</span>
      </div>

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
