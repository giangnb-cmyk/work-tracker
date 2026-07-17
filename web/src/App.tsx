// App shell: providers + auth gate + project gate. All routing/UI lives in Layout.

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SprintProvider, useSprintContext } from './contexts/SprintContext';
import { NotifyProvider } from './contexts/NotifyContext';
import Login from './components/Login';
import Layout from './components/Layout';
import RolePicker from './components/RolePicker';
import ProjectSelect from './components/ProjectSelect';
import ErrorCenter from './components/ErrorCenter';

/** Inside the providers: pick a project first, then show the workspace. */
function ProjectGate() {
  const { projectsLoading, selectedProjectId, selectedProject } = useSprintContext();

  if (projectsLoading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }
  // No project chosen (or the stored one was deleted) → show the landing selector.
  if (!selectedProjectId || !selectedProject) return <ProjectSelect />;
  return <Layout />;
}

function Gate() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }
  if (!user) return <Login />;

  // First login: make the user pick their job discipline before entering the app.
  if (profile && !profile.jobRole) return <RolePicker />;

  return (
    <SprintProvider>
      <NotifyProvider>
        <ProjectGate />
      </NotifyProvider>
    </SprintProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
      {/* NGOÀI Gate: lỗi lúc đang đăng nhập hoặc lúc chọn dự án cũng phải hiện được,
          mà những màn đó nằm trên các nhánh return sớm của Gate. */}
      <ErrorCenter />
    </AuthProvider>
  );
}
