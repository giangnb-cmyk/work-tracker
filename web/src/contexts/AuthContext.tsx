// AuthContext — owns Supabase Google sign-in state and the current user's profile.
// The DB trigger creates a `profiles` row on first sign-up; here we refresh presence
// and enforce the admin-managed sign-in allowlist.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { ALLOWED_EMAIL_DOMAIN, supabase } from '../supabase';
import { fetchAccessConfig, isEmailAllowed } from '../lib/accessConfig';
import { rowToMember } from '../lib/mappers';
import type { JobRole, TeamMember, UserRole } from '../types';

/** Minimal user shape the app consumes (keeps `uid` naming across components). */
interface AppUser {
  uid: string;
  email: string;
}

interface AuthState {
  user: AppUser | null;
  profile: TeamMember | null;
  role: UserRole;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  setJobRole: (jobRole: JobRole) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function displayNameOf(u: User): string {
  const m = u.user_metadata ?? {};
  return m.full_name || m.name || u.email || 'Unknown';
}
function photoOf(u: User): string {
  const m = u.user_metadata ?? {};
  return m.avatar_url || m.picture || '';
}

/** Ensure the profile row exists + refresh presence/display fields; returns it. */
async function syncProfile(u: User): Promise<TeamMember | null> {
  await supabase.from('profiles').upsert(
    {
      id: u.id,
      email: u.email ?? '',
      display_name: displayNameOf(u),
      photo_url: photoOf(u),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  const { data, error } = await supabase.from('profiles').select('*').eq('id', u.id).single();
  if (error || !data) {
    console.error('Load profile failed', error);
    return null;
  }
  return rowToMember(data);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<TeamMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const handledUser = useRef<string | null>(null);

  useEffect(() => {
    async function handle(u: User | null) {
      if (!u) {
        handledUser.current = null;
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      if (handledUser.current === u.id) return; // ignore token-refresh churn
      handledUser.current = u.id;
      try {
        const config = await fetchAccessConfig();
        if (!isEmailAllowed(u.email ?? '', config, ALLOWED_EMAIL_DOMAIN)) {
          await supabase.auth.signOut();
          handledUser.current = null;
          setError('Email của bạn chưa được cấp quyền truy cập. Liên hệ admin để được thêm vào danh sách.');
          return;
        }
        const p = await syncProfile(u);
        setUser({ uid: u.id, email: u.email ?? '' });
        setProfile(p);
      } catch (err) {
        console.error('Failed to load user profile', err);
        setError('Không tải được hồ sơ người dùng.');
      } finally {
        setLoading(false);
      }
    }

    supabase.auth.getSession().then(({ data }) => handle(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void handle(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn() {
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (err) {
      console.error('Sign-in failed', err);
      setError('Đăng nhập thất bại. Thử lại nhé.');
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function setJobRole(jobRole: JobRole) {
    if (!user) return;
    await supabase.from('profiles').update({ job_role: jobRole }).eq('id', user.uid);
    setProfile((p) => (p ? { ...p, jobRole } : p));
  }

  const value = useMemo<AuthState>(
    () => ({
      user,
      profile,
      role: profile?.role ?? 'member',
      isAdmin: profile?.role === 'admin',
      loading,
      error,
      signIn,
      signOut,
      setJobRole,
    }),
    [user, profile, loading, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
