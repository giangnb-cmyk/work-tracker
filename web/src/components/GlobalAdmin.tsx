import { Suspense } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { lazyView } from '../lib/lazyView';
import { navigate, useRoute, type ViewId } from '../lib/router';
import Avatar from './Avatar';

// Cùng kiểu lazy như Layout: mấy trang bảng nặng chỉ tải khi mở tới.
const Team = lazyView(() => import('./Team'));
const Visits = lazyView(() => import('./Visits'));
const Settings = lazyView(() => import('./Settings'));
const SystemLog = lazyView(() => import('./SystemLog'));
const CostAdmin = lazyView(() => import('./CostAdmin'));
const Reviews = lazyView(() => import('./Reviews'));

const TABS: { id: ViewId; label: string; icon: string }[] = [
  { id: 'team', label: 'Thành viên', icon: '👥' },
  { id: 'reviews', label: 'Đánh giá', icon: '📝' },
  { id: 'costs', label: 'Chi phí', icon: '💰' },
  { id: 'visits', label: 'Truy cập', icon: '👣' },
  { id: 'settings', label: 'Cấu hình', icon: '⚙️' },
  { id: 'log', label: 'Hệ thống', icon: '🖥️' },
];

function isTab(v: ViewId): v is 'team' | 'reviews' | 'costs' | 'visits' | 'settings' | 'log' {
  return v === 'team' || v === 'reviews' || v === 'costs' || v === 'visits' || v === 'settings' || v === 'log';
}

/**
 * Khu quản trị NGOÀI dự án — mở từ trang chọn dự án. Chứa việc bao quát cả web (roster toàn
 * bộ, truy cập web, cấu hình đăng nhập, nhật ký hệ thống), không thuộc riêng một dự án.
 * Bố cục = sidebar trái cố định (luôn mở) + nội dung. Gate admin ở App.ProjectGate.
 */
export default function GlobalAdmin() {
  const { profile, isAdmin, isOwner, signOut } = useAuth();
  const { view } = useRoute();
  const active: ViewId = isTab(view) ? view : 'team';
  const roleLabel = isOwner ? 'Owner' : isAdmin ? 'Admin' : 'Thành viên';

  return (
    <div className="ga-shell">
      <aside className="ga-sidebar">
        <button className="nav-item ga-back" onClick={() => navigate('/dashboard')} title="Về trang chọn dự án">
          <span className="icon" aria-hidden>←</span>
          <span>Chọn dự án</span>
        </button>

        <div className="ga-nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`nav-item${active === t.id ? ' active' : ''}`}
              onClick={() => navigate(`/${t.id}`)}
            >
              <span className="icon" aria-hidden>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Footer giống sidebar dự án: khối hồ sơ + nút Đăng xuất full-width (btn-signout). */}
        <div className="ga-footer">
          <div className="ga-user" title={profile?.displayName ?? ''}>
            <Avatar name={profile?.displayName ?? ''} photoURL={profile?.photoURL} size="sm" />
            <div className="ga-user-meta">
              <div className="ga-user-name">{profile?.displayName}</div>
              <div className="muted ga-user-role">{roleLabel}</div>
            </div>
          </div>
          <button className="btn-sm btn-signout ga-signout-btn" onClick={signOut}>Đăng xuất</button>
        </div>
      </aside>

      <main className="ga-main">
        <div className="ga-main-inner">
          <Suspense
            fallback={<div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>}
          >
            {active === 'team' && <Team />}
            {active === 'reviews' && <Reviews />}
            {active === 'costs' && <CostAdmin />}
            {active === 'visits' && <Visits />}
            {active === 'settings' && <Settings />}
            {active === 'log' && <SystemLog />}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
