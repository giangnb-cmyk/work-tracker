import { Suspense } from 'react';
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

/**
 * Khu quản trị NGOÀI dự án — mở từ trang chọn dự án. Chứa những thứ bao quát cả web
 * (roster toàn bộ, danh sách cho phép đăng nhập, nhật ký hệ thống), không thuộc riêng
 * một dự án. Gate admin nằm ở App.ProjectGate; ở đây chỉ dựng khung + chuyển tab.
 */
export default function GlobalAdmin() {
  const { profile, signOut } = useAuth();
  const { view } = useRoute();
  const active: ViewId = view === 'settings' || view === 'log' ? view : 'team';

  return (
    <div className="global-admin fade-in">
      <header className="global-admin-top">
        <button className="btn-sm" onClick={() => navigate('/dashboard')} title="Về trang chọn dự án">
          ← Chọn dự án
        </button>
        <nav className="global-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`chip${active === t.id ? ' on' : ''}`}
              onClick={() => navigate(`/${t.id}`)}
            >
              <span aria-hidden>{t.icon}</span> {t.label}
            </button>
          ))}
        </nav>
        <div className="row" style={{ gap: '0.6rem' }}>
          <Avatar name={profile?.displayName ?? ''} photoURL={profile?.photoURL} size="sm" />
          <button className="btn-sm btn-signout" onClick={signOut}>Đăng xuất</button>
        </div>
      </header>

      <div className="global-admin-body">
        <Suspense
          fallback={<div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>}
        >
          {active === 'team' && <Team />}
          {active === 'settings' && <Settings />}
          {active === 'log' && <SystemLog />}
        </Suspense>
      </div>
    </div>
  );
}
