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

// Nhớ trạng thái thu/mở giữa các lần vào. Mặc định THU GỌN: chưa có khoá -> collapsed.
const COLLAPSE_KEY = 'globalAdminCollapsed';

/**
 * Khu quản trị NGOÀI dự án — mở từ trang chọn dự án. Chứa những thứ bao quát cả web
 * (roster toàn bộ, danh sách cho phép đăng nhập, nhật ký hệ thống), không thuộc riêng một
 * dự án. Bố cục = sidebar trái (tab dọc) + nội dung, thu/mở chủ động, mặc định thu gọn.
 * Gate admin nằm ở App.ProjectGate; ở đây chỉ dựng khung + chuyển tab.
 */
export default function GlobalAdmin() {
  const { profile, signOut } = useAuth();
  const { view } = useRoute();
  const active: ViewId = view === 'settings' || view === 'log' ? view : 'team';
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) !== '0');

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  }

  return (
    <div className={`ga-shell${collapsed ? '' : ' expanded'}`}>
      <aside className="ga-sidebar">
        <button className="nav-item ga-toggle" onClick={toggle} title={collapsed ? 'Mở rộng' : 'Thu gọn'} aria-label="Thu gọn / mở rộng menu">
          <span className="icon" aria-hidden>{collapsed ? '☰' : '«'}</span>
          <span className="ga-label">Thu gọn</span>
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

        <div className="ga-footer">
          <div className="ga-user" title={profile?.displayName ?? ''}>
            <Avatar name={profile?.displayName ?? ''} photoURL={profile?.photoURL} size="sm" />
            <span className="ga-label ga-user-name">{profile?.displayName}</span>
          </div>
          <button className="nav-item ga-signout" onClick={signOut} title="Đăng xuất">
            <span className="icon" aria-hidden>⎋</span>
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
