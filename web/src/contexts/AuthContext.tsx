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
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ALLOWED_EMAIL_DOMAIN, auth, db, googleProvider } from '../firebase';
import type { TeamMember, UserRole } from '../types';

interface AuthState {
  user: User | null;
  profile: TeamMember | null;
  role: UserRole;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
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
      setError(null);
      if (!fbUser) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      try {
        const p = await upsertUserProfile(fbUser);
        setUser(fbUser);
        setProfile(p);
      } catch (err) {
        console.error('Failed to load user profile', err);
        setError('Không tải được hồ sơ người dùng.');
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  async function signIn() {
    setError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const email = cred.user.email ?? '';
      if (ALLOWED_EMAIL_DOMAIN && !email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
        await fbSignOut(auth);
        setError(`Chỉ tài khoản @${ALLOWED_EMAIL_DOMAIN} mới được đăng nhập.`);
      }
    } catch (err) {
      console.error('Sign-in failed', err);
      setError('Đăng nhập thất bại. Thử lại nhé.');
    }
  }

  async function signOut() {
    await fbSignOut(auth);
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
