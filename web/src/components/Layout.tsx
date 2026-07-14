import { lazy, Suspense, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Sidebar, { type ViewId } from './Sidebar';
import TopBar from './TopBar';

// Lazily code-split each view so the initial shell (and the Chart.js-heavy Dashboard)
// only download when first opened.
const SprintBoard = lazy(() => import('./SprintBoard'));
const MyTasks = lazy(() => import('./MyTasks'));
const Features = lazy(() => import('./Features'));
const Backlog = lazy(() => import('./Backlog'));
const Timeline = lazy(() => import('./Timeline'));
const Dashboard = lazy(() => import('./Dashboard'));
const SprintManager = lazy(() => import('./SprintManager'));
const Team = lazy(() => import('./Team'));
const Settings = lazy(() => import('./Settings'));

/** Main authenticated shell: nav + top bar + the active view. */
export default function Layout() {
  const { isAdmin } = useAuth();
  const [view, setView] = useState<ViewId>('board');

  // Guard against a non-admin landing on an admin-only view.
  const adminOnlyViews: ViewId[] = ['sprints', 'settings'];
  const activeView = adminOnlyViews.includes(view) && !isAdmin ? 'board' : view;

  return (
    <div className="app-shell">
      <Sidebar active={activeView} onSelect={setView} />
      <div className="main">
        <TopBar />
        <main className="tab-scroller">
          <Suspense fallback={<div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>}>
            {activeView === 'board' && <SprintBoard />}
            {activeView === 'mytasks' && <MyTasks />}
            {activeView === 'features' && <Features />}
            {activeView === 'backlog' && <Backlog />}
            {activeView === 'timeline' && <Timeline />}
            {activeView === 'dashboard' && <Dashboard />}
            {activeView === 'sprints' && <SprintManager />}
            {activeView === 'team' && <Team />}
            {activeView === 'settings' && <Settings />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
