import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { navigate, type ViewId } from '../lib/router';
import Avatar from './Avatar';
import ProfileModal from './ProfileModal';

interface NavDef {
  id: ViewId;
  label: string;
  icon: string;
}

/* 4 tab dùng nhiều nhất hằng ngày + "Thêm". Tối đa 5 tab (Apple HIG / Material 3) —
   phần còn lại nằm trong bottom sheet, KHÔNG nhét thêm tab thứ 6. */
const TABS: NavDef[] = [
  { id: 'dashboard', label: 'Thống kê', icon: '📊' },
  { id: 'board', label: 'Sprint', icon: '📋' },
  { id: 'mytasks', label: 'Của tôi', icon: '🎯' },
  { id: 'bugs', label: 'Bugs', icon: '🐞' },
];

const MORE: NavDef[] = [
  { id: 'features', label: 'Features', icon: '🧩' },
  { id: 'backlog', label: 'Backlog', icon: '📥' },
  { id: 'timeline', label: 'Timeline', icon: '📆' },
  { id: 'members', label: 'Thành viên', icon: '👥' },
];

/* Trùng ADMIN_NAV của Sidebar — hai nơi cùng nguồn ViewId nên thêm view admin mới
   là phải thêm cả hai (Sidebar là nguồn chính, đây là bản mobile). */
const MORE_ADMIN: NavDef[] = [
  { id: 'performance', label: 'Hiệu suất', icon: '📈' },
  { id: 'sprints', label: 'Quản lý Sprint', icon: '🗂️' },
];

interface MobileNavProps {
  active: ViewId;
  onSelect: (v: ViewId) => void;
}

/**
 * Bottom tab bar cho điện thoại (ẩn ≥769px bằng CSS — Sidebar là bản desktop).
 * Tab "Thêm" mở bottom sheet chứa các view còn lại + hồ sơ + đổi dự án + đăng xuất.
 */
export default function MobileNav({ active, onSelect }: MobileNavProps) {
  const { profile, isAdmin, isOwner, signOut } = useAuth();
  const { selectedProject, selectProject } = useSprintContext();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);

  // View đang mở nằm trong sheet → tab "Thêm" nhận trạng thái active.
  const moreActive = !TABS.some((t) => t.id === active);

  // Nút Back Android (Capacitor) và nút back trình duyệt phải đóng được sheet:
  // đẩy một history state khi mở, popstate thì đóng. Không có state này thì bấm
  // back khi sheet đang mở sẽ rời hẳn trang.
  useEffect(() => {
    if (!sheetOpen) return;
    history.pushState({ sheet: true }, '');
    const onPop = () => setSheetOpen(false);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [sheetOpen]);

  /**
   * Đóng sheet rồi MỚI chạy `after`. Phải chờ vì `history.back()` (nhả state đã đẩy
   * lúc mở) là BẤT ĐỒNG BỘ: navigate()/pushState gọi ngay sau nó sẽ bị chính cú pop
   * đó nuốt mất — nên treo `after` vào popstate một lần.
   */
  function closeThen(after?: () => void) {
    if (history.state?.sheet) {
      const once = () => {
        window.removeEventListener('popstate', once);
        after?.();
      };
      window.addEventListener('popstate', once);
      history.back();
    } else {
      setSheetOpen(false);
      after?.();
    }
  }

  function pick(v: ViewId) {
    closeThen(() => onSelect(v));
  }

  return (
    <>
      <nav className="mnav" aria-label="Điều hướng chính">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`mnav-item${active === t.id ? ' active' : ''}`}
            onClick={() => onSelect(t.id)}
          >
            <span className="mnav-ic" aria-hidden>{t.icon}</span>
            {t.label}
          </button>
        ))}
        <button
          className={`mnav-item${moreActive ? ' active' : ''}`}
          onClick={() => setSheetOpen(true)}
          aria-expanded={sheetOpen}
        >
          <span className="mnav-ic" aria-hidden>☰</span>
          Thêm
        </button>
      </nav>

      {sheetOpen && (
        <div className="sheet-overlay" onClick={() => closeThen()}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" aria-hidden />

            {MORE.map((n) => (
              <button
                key={n.id}
                className={`nav-item${active === n.id ? ' active' : ''}`}
                onClick={() => pick(n.id)}
              >
                <span className="icon">{n.icon}</span>
                {n.label}
              </button>
            ))}

            {isAdmin && (
              <>
                <hr className="sheet-sep" />
                {MORE_ADMIN.map((n) => (
                  <button
                    key={n.id}
                    className={`nav-item${active === n.id ? ' active' : ''}`}
                    onClick={() => pick(n.id)}
                  >
                    <span className="icon">{n.icon}</span>
                    {n.label}
                  </button>
                ))}
              </>
            )}

            <hr className="sheet-sep" />

            <button
              className="nav-item"
              onClick={() => closeThen(() => setEditingProfile(true))}
            >
              <span className="sheet-user">
                <Avatar name={profile?.displayName ?? ''} photoURL={profile?.photoURL} size="sm" />
                <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                  <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text)' }}>
                    {profile?.displayName}
                  </span>
                  <span className="muted" style={{ display: 'block', fontSize: '0.7rem' }}>
                    {isOwner ? 'Owner' : isAdmin ? 'Admin' : 'Thành viên'} — sửa hồ sơ
                  </span>
                </span>
              </span>
            </button>

            <button
              className="nav-item"
              onClick={() => closeThen(() => {
                selectProject(null);
                navigate('/dashboard', { replace: true });
              })}
            >
              <span className="icon">{selectedProject?.icon ?? '📁'}</span>
              Đổi dự án ({selectedProject?.name ?? '—'})
            </button>

            <button className="nav-item" onClick={() => closeThen(() => signOut())}>
              <span className="icon">🚪</span>
              Đăng xuất
            </button>
          </div>
        </div>
      )}

      {editingProfile && <ProfileModal onClose={() => setEditingProfile(false)} />}
    </>
  );
}
