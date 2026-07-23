import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { navigate, type ViewId } from '../lib/router';
import Avatar from './Avatar';
import ProfileModal from './ProfileModal';
import { EyeIcon } from './icons';

// ViewId giờ sống ở lib/router (nguồn sự thật của path) — re-export để import cũ không gãy.
// 'projects' is no longer an in-app tab — it's the landing page you enter through.
export type { ViewId } from '../lib/router';

interface NavDef {
  id: ViewId;
  label: string;
  icon: string;
}

/** Việc hằng ngày — ai cũng thấy. */
const NAV: NavDef[] = [
  // Thống kê đứng đầu: đây là trang tổng quan mở ra ngay khi vào dự án.
  { id: 'dashboard', label: 'Thống kê', icon: '📊' },
  { id: 'board', label: 'Bảng Sprint', icon: '📋' },
  { id: 'mytasks', label: 'Task của tôi', icon: '🎯' },
  { id: 'features', label: 'Features', icon: '🧩' },
  { id: 'backlog', label: 'Backlog', icon: '📥' },
  { id: 'bugs', label: 'Bugs', icon: '🐞' },
  { id: 'timeline', label: 'Timeline', icon: '📆' },
  // Roster CỦA dự án này (ai cũng xem được ai đang trong dự án). Toàn bộ hồ sơ web,
  // Cấu hình, Hệ thống là việc bao quát cả web → nằm NGOÀI dự án (trang chọn dự án).
  { id: 'members', label: 'Thành viên', icon: '👥' },
];

/**
 * Việc quản trị — gộp vào MỘT mục "Quản trị" bấm để xổ ra, thay vì 5 mục rải giữa các tab
 * dùng hằng ngày.
 */
const ADMIN_NAV: NavDef[] = [
  { id: 'performance', label: 'Hiệu suất', icon: '📈' },
  { id: 'sprints', label: 'Quản lý Sprint', icon: '🗂️' },
];

/**
 * Suy ra từ ADMIN_NAV thay vì khai lại bằng tay: Layout là thứ duy nhất chặn member mở
 * view admin, nên hai danh sách lệch nhau là lộ dữ liệu chứ không chỉ là lỗi hiển thị.
 * Thêm một mục vào ADMIN_NAV là nó được chặn luôn, không phải nhớ sửa hai chỗ.
 */
export const ADMIN_ONLY_VIEWS: ViewId[] = ADMIN_NAV.map((n) => n.id);

interface SidebarProps {
  active: ViewId;
  onSelect: (v: ViewId) => void;
}

export default function Sidebar({ active, onSelect }: SidebarProps) {
  const { profile, isAdmin, isOwner, isRealAdmin, isRealOwner, viewAsMember, viewAsAdmin, setViewAsMember, setViewAsAdmin, signOut } = useAuth();
  const { selectedProject, selectProject } = useSprintContext();
  const [editingProfile, setEditingProfile] = useState(false);
  // Đang đứng trong một view quản trị thì mở sẵn — không thì mục đang chọn bị giấu trong
  // nhóm đóng, người dùng không thấy mình đang ở đâu.
  const inAdminView = ADMIN_ONLY_VIEWS.includes(active);
  const [adminOpen, setAdminOpen] = useState(inAdminView);

  return (
    <aside className="sidebar">
      {/* Top-left: click to go back to the project-selection landing page.
          Reset path về /dashboard: giữ deep link cũ (vd /bugs/640) mà đổi dự án thì
          số bug đó có thể trúng một bug KHÁC trong dự án mới. */}
      <button className="project-back" onClick={() => { selectProject(null); navigate('/dashboard', { replace: true }); }} title="Về trang chọn dự án">
        <span className="back-arrow">←</span>
        <span className="project-back-icon">{selectedProject?.icon ?? '📁'}</span>
        <span className="project-back-name">{selectedProject?.name ?? 'Dự án'}</span>
      </button>

      {NAV.map((n) => (
        <button
          key={n.id}
          className={`nav-item${active === n.id ? ' active' : ''}`}
          onClick={() => onSelect(n.id)}
        >
          <span className="icon">{n.icon}</span>
          {n.label}
        </button>
      ))}

      {isAdmin && (
        <div className="nav-group">
          <button
            className={`nav-item nav-group-head${adminOpen ? ' open' : ''}`}
            onClick={() => setAdminOpen((v) => !v)}
            aria-expanded={adminOpen}
          >
            <span className="icon">🛠️</span>
            Quản trị
            {/* Chấm báo khi đang ở một mục con mà nhóm đang đóng — nếu không, mục đang mở
                trông như không được chọn ở đâu cả. */}
            {!adminOpen && inAdminView && <span className="nav-group-dot" aria-hidden />}
            <span className="nav-group-caret" aria-hidden>{adminOpen ? '▾' : '▸'}</span>
          </button>
          {adminOpen && (
            <div className="nav-sub">
              {ADMIN_NAV.map((n) => (
                <button
                  key={n.id}
                  className={`nav-item nav-sub-item${active === n.id ? ' active' : ''}`}
                  onClick={() => onSelect(n.id)}
                >
                  <span className="icon">{n.icon}</span>
                  {n.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
              {isOwner ? 'Owner' : isAdmin ? 'Admin' : 'Thành viên'}
            </div>
          </div>
        </button>
        {/* Ẩn hẳn khi ĐANG xem thử: sidebar phải giống y hệt cái vai được mô phỏng nhìn
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
        {isRealOwner && !viewAsAdmin && !viewAsMember && (
          <button
            className="btn-sm preview-toggle"
            onClick={() => setViewAsAdmin(true)}
            title="Xem giao diện đúng như một admin thường (không có độc quyền owner)"
          >
            <EyeIcon size={15} />
            Xem như admin
          </button>
        )}
        <button className="btn-sm btn-signout" style={{ width: '100%', marginTop: '0.4rem' }} onClick={signOut}>
          Đăng xuất
        </button>
      </div>

      {editingProfile && <ProfileModal onClose={() => setEditingProfile(false)} />}
    </aside>
  );
}
