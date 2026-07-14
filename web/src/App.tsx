// App shell: providers + auth gate only. All routing/UI lives in Layout.

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SprintProvider } from './contexts/SprintContext';
import Login from './components/Login';
import Layout from './components/Layout';
import RolePicker from './components/RolePicker';

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
      <Layout />
    </SprintProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
