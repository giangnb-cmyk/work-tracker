// App shell: providers + auth gate only. All routing/UI lives in Layout.

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SprintProvider } from './contexts/SprintContext';
import Login from './components/Login';
import Layout from './components/Layout';

function Gate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }
  if (!user) return <Login />;

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
