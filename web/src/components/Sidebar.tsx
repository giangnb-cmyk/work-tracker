import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import Avatar from './Avatar';
import ProfileModal from './ProfileModal';
import { EyeIcon } from './icons';

// 'projects' is no longer an in-app tab — it's the landing page you enter through.
export type ViewId = 'dashboard' | 'performance' | 'board' | 'mytasks' | 'features' | 'backlog' | 'bugs' | 'timeline' | 'sprints' | 'team' | 'settings';

interface NavDef {
  id: ViewId;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

const NAV: NavDef[] = [
  // Thống kê đứng đầu: đây là trang tổng quan mở ra ngay khi vào dự án.
  { id: 'dashboard', label: 'Thống kê', icon: '📊' },
  { id: 'performance', label: 'Hiệu suất', icon: '📈', adminOnly: true },
  { id: 'board', label: 'Bảng Sprint', icon: '📋' },
  { id: 'mytasks', label: 'Task của tôi', icon: '🎯' },
  { id: 'features', label: 'Features', icon: '🧩' },
  { id: 'backlog', label: 'Backlog', icon: '📥' },
  { id: 'bugs', label: 'Bugs', icon: '🐞' },
  { id: 'timeline', label: 'Timeline', icon: '📆' },
  { id: 'sprints', label: 'Quản lý Sprint', icon: '🗂️', adminOnly: true },
  { id: 'team', label: 'Thành viên', icon: '👥', adminOnly: true },
  { id: 'settings', label: 'Cấu hình', icon: '⚙️', adminOnly: true },
];

/**
 * Suy ra từ NAV thay vì khai lại bằng tay: Layout là thứ duy nhất chặn member mở view
 * admin, nên hai danh sách lệch nhau là lộ dữ liệu chứ không chỉ là lỗi hiển thị.
 */
export const ADMIN_ONLY_VIEWS: ViewId[] = NAV.filter((n) => n.adminOnly).map((n) => n.id);

interface SidebarProps {
  active: ViewId;
  onSelect: (v: ViewId) => void;
}

export default function Sidebar({ active, onSelect }: SidebarProps) {
  const { profile, isAdmin, isRealAdmin, viewAsMember, setViewAsMember, signOut } = useAuth();
  const { selectedProject, selectProject } = useSprintContext();
  const [editingProfile, setEditingProfile] = useState(false);

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
        <button
          className="row profile-btn"
          onClick={() => setEditingProfile(true)}
          title="Sửa hồ sơ của tôi (tên, Discord ID, Notion ID)"
        >
          <Avatar name={profile?.displayName ?? ''} photoURL={profile?.photoURL} size="sm" />
          <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {profile?.displayName}
            </div>
            <div className="muted" style={{ fontSize: '0.7rem' }}>
              {isAdmin ? 'Admin' : 'Thành viên'}
            </div>
          </div>
        </button>
        {/* Ẩn hẳn khi ĐANG xem thử: sidebar phải giống y hệt cái thành viên thật nhìn
            thấy. Lối thoát nằm ở MemberPreviewBar phía trên. */}
        {isRealAdmin && !viewAsMember && (
          <button
            className="btn-sm preview-toggle"
            onClick={() => setViewAsMember(true)}
            title="Xem giao diện đúng như một thành viên thường nhìn thấy"
          >
            <EyeIcon size={15} />
            Xem như thành viên
          </button>
        )}
        <button className="btn-sm" style={{ width: '100%', marginTop: '0.4rem' }} onClick={signOut}>
          Đăng xuất
        </button>
      </div>

      {editingProfile && <ProfileModal onClose={() => setEditingProfile(false)} />}
    </aside>
  );
}
