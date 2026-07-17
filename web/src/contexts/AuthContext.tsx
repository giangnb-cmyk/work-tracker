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
import { logVisit } from '../lib/visitWrites';
import { navigate } from '../lib/router';
import { rowToMember } from '../lib/mappers';
import type { JobRole, TeamMember, UserRole } from '../types';

/** Minimal user shape the app consumes (keeps `uid` naming across components). */
interface AppUser {
  uid: string;
  email: string;
}

/** Khoá sessionStorage — cố ý KHÔNG dùng localStorage: đóng tab là thoát chế độ xem thử. */
const PREVIEW_KEY = 'viewAsMember';

/**
 * Deep link mở lúc CHƯA đăng nhập: OAuth redirect quay về origin '/' nên path bị mất.
 * Stash trước khi đi Google, khôi phục sau khi phiên về. sessionStorage: chỉ sống
 * trong tab đó, không dây sang lần đăng nhập khác.
 */
const POST_LOGIN_PATH_KEY = 'postLoginPath';

interface AuthState {
  user: AppUser | null;
  profile: TeamMember | null;
  role: UserRole;
  /** Quyền HIỆU LỰC — đã trừ chế độ xem thử. MỌI cổng phân quyền phải dùng cái này. */
  isAdmin: boolean;
  /**
   * Quyền THẬT theo profile, không bị chế độ xem thử ảnh hưởng.
   * CHỈ dùng cho chính công tắc xem thử — nếu dùng nó để gate tính năng thì chế độ xem
   * thử sẽ vô nghĩa ở chỗ đó.
   */
  isRealAdmin: boolean;
  viewAsMember: boolean;
  setViewAsMember: (on: boolean) => void;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  setJobRole: (jobRole: JobRole) => Promise<void>;
  /**
   * Tự sửa hồ sơ của CHÍNH mình (tên, Discord id, Notion id).
   * RLS `profiles_update` cho phép `id = auth.uid()`, nhưng WITH CHECK ép role phải giữ
   * nguyên 'member' → member không tự phong admin được. Ném lỗi để form hiện ra.
   */
  updateProfile: (patch: OwnProfileInput) => Promise<void>;
}

/** Các trường người dùng tự sửa được. Chuỗi rỗng = gỡ liên kết. */
export interface OwnProfileInput {
  displayName: string;
  discordId: string;
  notionUserId: string;
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

/**
 * Chỉ ghi presence khi dấu vết cũ hơn ngần này. Ghi MỖI lượt mở trang thì bảng
 * profiles (đang phát realtime) kích cả team refetch lại roster — write vô ích.
 */
const PRESENCE_STALE_MS = 10 * 60 * 1000;

/** Ensure the profile row exists + refresh presence/display fields; returns it. */
async function syncProfile(u: User): Promise<TeamMember | null> {
  // Đọc trước, ghi sau: lượt mở trang thông thường chỉ tốn MỘT chuyến mạng và không
  // ghi gì (trước đây là upsert + select lại = 2 chuyến + 1 write mỗi lượt).
  const { data: existing, error: readErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', u.id)
    .maybeSingle();
  if (readErr) {
    console.error('Tải hồ sơ thất bại', readErr);
    return null;
  }

  const fresh = {
    email: u.email ?? '',
    display_name: displayNameOf(u),
    photo_url: photoOf(u),
  };

  if (!existing) {
    // Lần đăng nhập đầu: tạo row — .select() ngay trên upsert để ghi + đọc lại
    // gói trong một chuyến.
    const { data, error } = await supabase
      .from('profiles')
      .upsert({ ...fresh, id: u.id, last_seen_at: new Date().toISOString() }, { onConflict: 'id' })
      .select('*')
      .single();
    if (error || !data) {
      console.error('Tạo hồ sơ thất bại', error);
      return null;
    }
    return rowToMember(data);
  }

  // Row đã có: chỉ ghi khi Google đổi tên/ảnh/email hoặc presence đã nguội — và ghi
  // NỀN, không bắt màn hình khởi động chờ một cái write.
  const changed =
    existing.email !== fresh.email ||
    existing.display_name !== fresh.display_name ||
    existing.photo_url !== fresh.photo_url;
  const lastSeen = existing.last_seen_at ? new Date(existing.last_seen_at).getTime() : 0;
  if (changed || Date.now() - lastSeen > PRESENCE_STALE_MS) {
    void supabase
      .from('profiles')
      .update({ ...(changed ? fresh : {}), last_seen_at: new Date().toISOString() })
      .eq('id', u.id)
      .then(({ error }) => {
        if (error) console.error('Cập nhật presence thất bại', error);
      });
  }
  return rowToMember(changed ? { ...existing, ...fresh } : existing);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<TeamMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewAsMember, setViewAsMemberState] = useState(
    () => sessionStorage.getItem(PREVIEW_KEY) === '1',
  );
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
        // Khôi phục deep link đã stash trước vòng OAuth (xem POST_LOGIN_PATH_KEY).
        const stashedPath = sessionStorage.getItem(POST_LOGIN_PATH_KEY);
        if (stashedPath) {
          sessionStorage.removeItem(POST_LOGIN_PATH_KEY);
          navigate(stashedPath, { replace: true });
        }
        // Sau khi qua cửa allowlist: người bị từ chối không tính là một lượt truy cập.
        void logVisit(u.id);
      } catch (err) {
        console.error('Tải hồ sơ người dùng thất bại', err);
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
    // Giữ deep link qua vòng OAuth. Không nhét path vào redirectTo: URL redirect phải
    // nằm trong allowlist của Supabase, origin thì chắc chắn có còn path thì không.
    const deepPath = window.location.pathname + window.location.search;
    if (deepPath !== '/') sessionStorage.setItem(POST_LOGIN_PATH_KEY, deepPath);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (err) {
      console.error('Đăng nhập thất bại', err);
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

  async function updateProfile(patch: OwnProfileInput) {
    if (!user) return;
    const displayName = patch.displayName.trim();
    // Chuỗi rỗng -> NULL: cột nullable, và '' sẽ phá ràng buộc unique của discord_id —
    // hai người cùng bỏ trống là hai chuỗi '' TRÙNG nhau, còn NULL thì không đụng nhau.
    const discordId = patch.discordId.trim() || null;
    const notionUserId = patch.notionUserId.trim() || null;

    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName, discord_id: discordId, notion_user_id: notionUserId })
      .eq('id', user.uid);
    if (error) throw error;

    // TeamMember dùng `undefined` cho "chưa có" (xem rowToMember) — đừng để null lọt vào state.
    setProfile((p) =>
      p
        ? {
            ...p,
            displayName,
            discordId: discordId ?? undefined,
            notionUserId: notionUserId ?? undefined,
          }
        : p,
    );
  }

  const isRealAdmin = profile?.role === 'admin';

  /**
   * Chế độ xem thử CHỈ được phép GIẢM quyền, không bao giờ cấp thêm — nên `isAdmin` luôn
   * là `isRealAdmin && !viewAsMember`. Member bật cờ này lên cũng không đổi được gì.
   */
  function setViewAsMember(on: boolean) {
    if (!isRealAdmin) return;
    if (on) sessionStorage.setItem(PREVIEW_KEY, '1');
    else sessionStorage.removeItem(PREVIEW_KEY);
    setViewAsMemberState(on);
  }

  const value = useMemo<AuthState>(
    () => ({
      user,
      profile,
      // `role` là vai trò HIỆU LỰC nên chế độ xem thử phản chiếu đúng ở đây luôn.
      role: isRealAdmin && !viewAsMember ? 'admin' : 'member',
      isAdmin: isRealAdmin && !viewAsMember,
      isRealAdmin,
      viewAsMember,
      setViewAsMember,
      loading,
      error,
      signIn,
      signOut,
      setJobRole,
      updateProfile,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, profile, loading, error, isRealAdmin, viewAsMember],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
