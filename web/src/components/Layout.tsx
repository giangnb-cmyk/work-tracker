import { Suspense } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { lazyView } from '../lib/lazyView';
import { isGlobalAdminView, navigate, pathFor, useRoute } from '../lib/router';
import MemberPreviewBar from './MemberPreviewBar';
import Sidebar, { ADMIN_ONLY_VIEWS } from './Sidebar';
import TopBar from './TopBar';

// Lazily code-split each view so the initial shell (and the Chart.js-heavy Dashboard)
// only download when first opened. Dùng lazyView (không phải lazy thuần) để một
// deploy mới — vốn xoá chunk hash cũ khỏi CDN — không làm vỡ tab đang mở.
const SprintBoard = lazyView(() => import('./SprintBoard'));
const MyTasks = lazyView(() => import('./MyTasks'));
const Features = lazyView(() => import('./Features'));
const Backlog = lazyView(() => import('./Backlog'));
const Bugs = lazyView(() => import('./Bugs'));
const Timeline = lazyView(() => import('./Timeline'));
// Dashboard là view MẶC ĐỊNH sau khi vào dự án — kích tải chunk (kéo theo chunk
// Chart.js) ngay từ lúc boot, song song với các lượt gọi auth, thay vì nối đuôi
// sau cổng chọn dự án. Các view khác vẫn lazy thuần vì không chắc được mở.
const dashboardImport = import('./Dashboard');
// Promise chạy ngay từ lúc module load, nhưng lazyView chỉ gắn .catch khi render.
// Nuốt trước một nhánh để lỗi chunk không nổi thành unhandledrejection trong lúc đó.
dashboardImport.catch(() => {});
const Dashboard = lazyView(() => dashboardImport);
const Performance = lazyView(() => import('./Performance'));
const Visits = lazyView(() => import('./Visits'));
const SprintManager = lazyView(() => import('./SprintManager'));
const ProjectMembers = lazyView(() => import('./ProjectMembers'));
// Lazy để TaskModal (nó import tĩnh) không bị kéo vào bundle khởi động.
const TaskDeepLink = lazyView(() => import('./TaskDeepLink'));

/** Main authenticated shell: nav + top bar + the active view. */
export default function Layout() {
  const { isAdmin } = useAuth();
  // View lái bằng URL (lib/router) để mọi tab/bug/task đều có link gửi được.
  // Path gốc '/' parse ra 'dashboard' — vào dự án vẫn thấy trang tổng quan trước.
  const route = useRoute();

  // Guard against a non-admin landing on an admin-only view. Danh sách suy ra từ NAV
  // của Sidebar nên không thể lệch khi thêm view admin mới. View toàn-web (team/settings/
  // log) mở ở GlobalAdmin NGOÀI dự án, không dựng ở đây — ai lỡ điều hướng tới trong lúc
  // đang ở dự án thì đưa về Thống kê thay vì màn trắng.
  const guarded =
    isGlobalAdminView(route.view) || (ADMIN_ONLY_VIEWS.includes(route.view) && !isAdmin);
  const activeView = guarded ? 'dashboard' : route.view;

  // Deep link task theo id (/tasks/<id>) HOẶC short_code (/t/<mã>) — hai path loại trừ nhau.
  const taskMatch: { column: 'id' | 'short_code'; value: string } | null = route.taskId
    ? { column: 'id', value: route.taskId }
    : route.taskCode
      ? { column: 'short_code', value: route.taskCode }
      : null;

  return (
    <div className="app-shell">
      <Sidebar active={activeView} onSelect={(v) => navigate(pathFor(v))} />
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
            {activeView === 'visits' && <Visits />}
            {activeView === 'sprints' && <SprintManager />}
            {activeView === 'members' && <ProjectMembers />}
            {/* Deep link task (đủ /tasks/<id> hoặc rút gọn /t/<mã>): modal đè lên view nền. */}
            {taskMatch && <TaskDeepLink match={taskMatch} fallbackPath={pathFor(activeView)} />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
