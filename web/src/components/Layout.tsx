import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import Sidebar, { type ViewId } from './Sidebar';
import TopBar from './TopBar';
import SprintBoard from './SprintBoard';
import MyTasks from './MyTasks';
import Dashboard from './Dashboard';
import SprintManager from './SprintManager';
import Team from './Team';
import Settings from './Settings';
import TaskModal from './TaskModal';

/** Main authenticated shell: nav + top bar + the active view. */
export default function Layout() {
  const { isAdmin } = useAuth();
  const { selectedSprintId } = useSprintContext();
  const [view, setView] = useState<ViewId>('board');
  const [creating, setCreating] = useState(false);

  // Guard against a non-admin landing on an admin-only view.
  const adminOnlyViews: ViewId[] = ['sprints', 'settings'];
  const activeView = adminOnlyViews.includes(view) && !isAdmin ? 'board' : view;

  return (
    <div className="app-shell">
      <Sidebar active={activeView} onSelect={setView} />
      <div className="main">
        <TopBar onNewTask={() => setCreating(true)} />
        <main className="tab-scroller">
          {activeView === 'board' && <SprintBoard />}
          {activeView === 'mytasks' && <MyTasks />}
          {activeView === 'dashboard' && <Dashboard />}
          {activeView === 'sprints' && <SprintManager />}
          {activeView === 'team' && <Team />}
          {activeView === 'settings' && <Settings />}
        </main>
      </div>

      {creating && (
        <TaskModal defaultSprintId={selectedSprintId} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}
