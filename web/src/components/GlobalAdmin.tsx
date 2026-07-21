import { Suspense, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { lazyView } from '../lib/lazyView';
import { navigate, useRoute, type ViewId } from '../lib/router';
import Avatar from './Avatar';

// Cùng kiểu lazy như Layout: mấy trang bảng nặng chỉ tải khi mở tới.
const Team = lazyView(() => import('./Team'));
const Settings = lazyView(() => import('./Settings'));
const SystemLog = lazyView(() => import('./SystemLog'));

const TABS: { id: ViewId; label: string; icon: string }[] = [
  { id: 'team', label: 'Thành viên', icon: '👥' },
  { id: 'settings', label: 'Cấu hình', icon: '⚙️' },
  { id: 'log', label: 'Hệ thống', icon: '🖥️' },
];

// Nhớ trạng thái GHIM giữa các lần vào. Mặc định KHÔNG ghim = rail thu gọn (rê chuột tự mở).
const PIN_KEY = 'globalAdminPinned';

/**
 * Khu quản trị NGOÀI dự án — mở từ trang chọn dự án. Chứa việc bao quát cả web (roster toàn
 * bộ, cấu hình đăng nhập, nhật ký hệ thống), không thuộc riêng một dự án.
 *
 * UX: rail trái thu gọn (chỉ icon). RÊ CHUỘT vào → tự mở đè lên nội dung (overlay, không xô
 * layout). Nút mũi tên tròn giữa mép phải để GHIM mở (đẩy nội dung) hoặc thu lại — trạng thái
 * ghim nhớ qua localStorage. Gate admin ở App.ProjectGate; ở đây chỉ dựng khung + đổi tab.
 */
export default function GlobalAdmin() {
  const { profile, isAdmin, isOwner, signOut } = useAuth();
  const { view } = useRoute();
  const active: ViewId = view === 'settings' || view === 'log' ? view : 'team';
  const [pinned, setPinned] = useState(() => localStorage.getItem(PIN_KEY) === '1');

  function togglePin() {
    setPinned((p) => {
      const next = !p;
      localStorage.setItem(PIN_KEY, next ? '1' : '0');
      return next;
    });
  }

  const roleLabel = isOwner ? 'Owner' : isAdmin ? 'Admin' : 'Thành viên';

  return (
    <div className={`ga-shell${pinned ? ' pinned' : ''}`}>
      <aside className="ga-sidebar">
        {/* Nút mũi tên GIỮA mép phải: ghim mở / thu lại. Chỉ hiện khi panel đang mở. */}
        <button
          className="ga-pin-btn"
          onClick={togglePin}
          title={pinned ? 'Thu gọn thanh bên' : 'Ghim mở thanh bên'}
          aria-label={pinned ? 'Thu gọn thanh bên' : 'Ghim mở thanh bên'}
          aria-pressed={pinned}
        >
          {pinned ? '‹' : '›'}
        </button>

        <button className="nav-item ga-back" onClick={() => navigate('/dashboard')} title="Về trang chọn dự án">
          <span className="icon" aria-hidden>←</span>
          <span className="ga-label">Chọn dự án</span>
        </button>

        <div className="ga-nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`nav-item${active === t.id ? ' active' : ''}`}
              onClick={() => navigate(`/${t.id}`)}
              title={t.label}
            >
              <span className="icon" aria-hidden>{t.icon}</span>
              <span className="ga-label">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Footer giống sidebar dự án: khối hồ sơ + nút Đăng xuất full-width (btn-signout). */}
        <div className="ga-footer">
          <div className="ga-user" title={profile?.displayName ?? ''}>
            <Avatar name={profile?.displayName ?? ''} photoURL={profile?.photoURL} size="sm" />
            <div className="ga-user-meta ga-label">
              <div className="ga-user-name">{profile?.displayName}</div>
              <div className="muted ga-user-role">{roleLabel}</div>
            </div>
          </div>
          <button className="btn-sm btn-signout ga-signout-btn" onClick={signOut} title="Đăng xuất">
            <span className="ga-signout-ic" aria-hidden>⎋</span>
            <span className="ga-label">Đăng xuất</span>
          </button>
        </div>
      </aside>

      <main className="ga-main">
        <div className="ga-main-inner">
          <Suspense
            fallback={<div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>}
          >
            {active === 'team' && <Team />}
            {active === 'settings' && <Settings />}
            {active === 'log' && <SystemLog />}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
