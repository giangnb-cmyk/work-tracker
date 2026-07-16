import { lazy, Suspense, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import MemberPreviewBar from './MemberPreviewBar';
import Sidebar, { ADMIN_ONLY_VIEWS, type ViewId } from './Sidebar';
import TopBar from './TopBar';

// Lazily code-split each view so the initial shell (and the Chart.js-heavy Dashboard)
// only download when first opened.
const SprintBoard = lazy(() => import('./SprintBoard'));
const MyTasks = lazy(() => import('./MyTasks'));
const Features = lazy(() => import('./Features'));
const Backlog = lazy(() => import('./Backlog'));
const Bugs = lazy(() => import('./Bugs'));
const Timeline = lazy(() => import('./Timeline'));
const Dashboard = lazy(() => import('./Dashboard'));
const Performance = lazy(() => import('./Performance'));
const SprintManager = lazy(() => import('./SprintManager'));
const Team = lazy(() => import('./Team'));
const Settings = lazy(() => import('./Settings'));

/** Main authenticated shell: nav + top bar + the active view. */
export default function Layout() {
  const { isAdmin } = useAuth();
  // Vào dự án là thấy trang tổng quan trước, rồi mới đi tiếp vào bảng sprint.
  const [view, setView] = useState<ViewId>('dashboard');

  // Guard against a non-admin landing on an admin-only view. Danh sách suy ra từ NAV
  // của Sidebar nên không thể lệch khi thêm view admin mới.
  const activeView = ADMIN_ONLY_VIEWS.includes(view) && !isAdmin ? 'dashboard' : view;

  return (
    <div className="app-shell">
      <Sidebar active={activeView} onSelect={setView} />
      <div className="main">
        {/* Cả .preview-bar lẫn .topbar phải dính cùng nhau. Lưu ý: .tab-scroller KHÔNG
            phải phần tử cuộn (.app-shell là min-height:100vh nên nó cao theo nội dung và
            chính CỬA SỔ mới cuộn) — nên "nằm ngoài .tab-scroller" không đủ để đứng yên,
            phải sticky thật. */}
        <div className="main-head">
          <MemberPreviewBar />
          <TopBar />
        </div>
        <main className="tab-scroller">
          <Suspense fallback={<div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>}>
            {activeView === 'board' && <SprintBoard />}
            {activeView === 'mytasks' && <MyTasks />}
            {activeView === 'features' && <Features />}
            {activeView === 'backlog' && <Backlog />}
            {activeView === 'bugs' && <Bugs />}
            {activeView === 'timeline' && <Timeline />}
            {activeView === 'dashboard' && <Dashboard />}
            {activeView === 'performance' && <Performance />}
            {activeView === 'sprints' && <SprintManager />}
            {activeView === 'team' && <Team />}
            {activeView === 'settings' && <Settings />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
