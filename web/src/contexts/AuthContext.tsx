// AuthContext — owns Google sign-in state and the current user's team profile.
// On sign-in it upserts the `users/{uid}` doc (see DATA_MODEL.md).

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { ALLOWED_EMAIL_DOMAIN, auth, db, googleProvider } from '../firebase';
import { fetchAccessConfig, isEmailAllowed } from '../lib/accessConfig';
import type { JobRole, TeamMember, UserRole } from '../types';

interface AuthState {
  user: User | null;
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

/** Create the user doc on first sign-in, or refresh lastSeenAt on return visits. */
async function upsertUserProfile(user: User): Promise<TeamMember> {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const fresh: Omit<TeamMember, 'createdAt' | 'lastSeenAt'> = {
      uid: user.uid,
      email: user.email ?? '',
      displayName: user.displayName ?? user.email ?? 'Unknown',
      photoURL: user.photoURL ?? '',
      role: 'member',
    };
    await setDoc(ref, { ...fresh, createdAt: serverTimestamp(), lastSeenAt: serverTimestamp() });
    return { ...fresh } as TeamMember;
  }

  // Existing member: keep their role, just refresh presence + display fields.
  await setDoc(
    ref,
    {
      displayName: user.displayName ?? user.email ?? 'Unknown',
      photoURL: user.photoURL ?? '',
      lastSeenAt: serverTimestamp(),
    },
    { merge: true },
  );
  return snap.data() as TeamMember;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<TeamMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      try {
        // Enforce the admin-managed sign-in allowlist before creating a profile.
        const config = await fetchAccessConfig();
        if (!isEmailAllowed(fbUser.email ?? '', config, ALLOWED_EMAIL_DOMAIN)) {
          await fbSignOut(auth);
          setError('Email của bạn chưa được cấp quyền truy cập. Liên hệ admin để được thêm vào danh sách.');
          return;
        }
        const p = await upsertUserProfile(fbUser);
        setUser(fbUser);
        setProfile(p);
      } catch (err) {
        console.error('Failed to load user profile', err);
        const code = (err as { code?: string })?.code ?? '';
        // Surface the most common setup causes so the user knows what to fix.
        if (code === 'permission-denied') {
          setError('Chưa deploy Firestore rules (hoặc rules chặn). Hãy publish firestore.rules.');
        } else if (code === 'unavailable' || code === 'not-found') {
          setError('Chưa tạo Firestore Database, hoặc sai vùng/kết nối. Tạo database trong Console.');
        } else {
          setError(`Không tải được hồ sơ người dùng${code ? ` (${code})` : ''}.`);
        }
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  async function signIn() {
    setError(null);
    try {
      // Allowlist enforcement happens centrally in onAuthStateChanged.
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Sign-in failed', err);
      setError('Đăng nhập thất bại. Thử lại nhé.');
    }
  }

  async function signOut() {
    await fbSignOut(auth);
  }

  /** Persist the user's chosen job discipline (used by the first-login role picker). */
  async function setJobRole(jobRole: JobRole) {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), { jobRole });
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
