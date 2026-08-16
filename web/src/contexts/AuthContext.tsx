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
import { isNative, nativeGoogleSignIn } from '../lib/native';
import { fetchAccessConfig, isEmailAllowed } from '../lib/accessConfig';
import { logVisit } from '../lib/visitWrites';
import { navigate } from '../lib/router';
import { rowToMember } from '../lib/mappers';
import type { MemberPerm, TeamMember, UserRole } from '../types';

/** Minimal user shape the app consumes (keeps `uid` naming across components). */
interface AppUser {
  uid: string;
  email: string;
}

/** Khoá sessionStorage — cố ý KHÔNG dùng localStorage: đóng tab là thoát chế độ xem thử. */
const PREVIEW_KEY = 'viewAsMember';
/** Xem thử "như admin" (chỉ owner) — sessionStorage riêng, hai chế độ loại trừ nhau. */
const PREVIEW_ADMIN_KEY = 'viewAsAdmin';

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
   * Là OWNER (hiệu lực, đã trừ xem thử). Owner = admin + độc quyền cấp/đổi vai trò (0037).
   * Chỉ gate riêng thao tác phong/gỡ admin — mọi thứ khác cứ dùng `isAdmin` (đã bao owner).
   */
  isOwner: boolean;
  /**
   * Quyền lẻ hiệu lực (0034): admin luôn có; member theo `profile.perms` do admin cấp.
   * Gate theo quyền lẻ thì dùng cái này thay vì `isAdmin` — nó đã bao admin rồi.
   */
  can: (perm: MemberPerm) => boolean;
  /**
   * Quyền THẬT theo profile, không bị chế độ xem thử ảnh hưởng.
   * CHỈ dùng cho chính công tắc xem thử — nếu dùng nó để gate tính năng thì chế độ xem
   * thử sẽ vô nghĩa ở chỗ đó.
   */
  isRealAdmin: boolean;
  /** Owner THẬT theo profile, bỏ qua xem thử — dùng cho cổng phong/gỡ admin trong UI. */
  isRealOwner: boolean;
  viewAsMember: boolean;
  setViewAsMember: (on: boolean) => void;
  /** Owner xem thử với con mắt ADMIN thường (mất các độc quyền owner: sửa dự án, đổi vai trò). */
  viewAsAdmin: boolean;
  setViewAsAdmin: (on: boolean) => void;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Chọn role (bảng roles, 0072) cho CHÍNH mình — flow RolePicker lần đầu đăng nhập.
   * Trigger `profiles_guard_role_id` chỉ cho member tự chọn khi role_id đang trống;
   * đổi về sau là việc của admin (MemberModal).
   */
  setRole: (roleId: string) => Promise<void>;
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
  const [viewAsAdmin, setViewAsAdminState] = useState(
    () => sessionStorage.getItem(PREVIEW_ADMIN_KEY) === '1',
  );
  /** Quyền theo role động (roles.perms) — has_perm() phía DB đã gộp, đây là bản soi client. */
  const [rolePerms, setRolePerms] = useState<MemberPerm[]>([]);
  const handledUser = useRef<string | null>(null);

  // Nạp bộ quyền của role đang mang. Không realtime: role đổi quyền là việc hiếm,
  // reload là ăn — RLS phía DB mới là tầng chặn thật.
  useEffect(() => {
    const roleId = profile?.roleId;
    if (!roleId) {
      setRolePerms([]);
      return;
    }
    let cancelled = false;
    void supabase
      .from('roles')
      .select('perms')
      .eq('id', roleId)
      .single()
      .then(({ data, error: err }) => {
        if (!cancelled) setRolePerms(err ? [] : ((data?.perms ?? []) as MemberPerm[]));
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.roleId]);

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

    // APP NATIVE (Capacitor): Google chặn OAuth trong webview → đăng nhập bằng sheet
    // Google native rồi signInWithIdToken. Không có redirect nên không cần stash path
    // (trang không reload, onAuthStateChange tự bắn ngay tại chỗ).
    if (isNative) {
      try {
        await nativeGoogleSignIn();
      } catch (err) {
        console.error('Đăng nhập native thất bại', err);
        setError(err instanceof Error ? err.message : 'Đăng nhập thất bại. Thử lại nhé.');
      }
      return;
    }

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

  async function setRole(roleId: string) {
    if (!user) return;
    const { data, error } = await supabase
      .from('profiles')
      .update({ role_id: roleId })
      .eq('id', user.uid)
      .select()
      .single();
    if (error) throw error;
    // Lấy nguyên hàng về: trigger vừa đồng bộ cả job_role theo legacy_job_role của role.
    setProfile(rowToMember(data));
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

  // Owner kế thừa mọi quyền admin (is_admin bao owner ở DB, 0037) — soi ở client cũng vậy.
  const isRealAdmin = profile?.role === 'admin' || profile?.role === 'owner';
  const isRealOwner = profile?.role === 'owner';

  /**
   * Chế độ xem thử hạ về member THƯỜNG — không tính cả perms lẻ của chính mình,
   * để admin thấy đúng giao diện của member chưa được cấp gì.
   */
  function can(perm: MemberPerm): boolean {
    if (viewAsMember) return false;
    return isRealAdmin || (profile?.perms ?? []).includes(perm) || rolePerms.includes(perm);
  }

  /**
   * Chế độ xem thử CHỈ được phép GIẢM quyền, không bao giờ cấp thêm — nên `isAdmin` luôn
   * là `isRealAdmin && !viewAsMember`. Member bật cờ này lên cũng không đổi được gì.
   */
  function setViewAsMember(on: boolean) {
    if (!isRealAdmin) return;
    if (on) sessionStorage.setItem(PREVIEW_KEY, '1');
    else sessionStorage.removeItem(PREVIEW_KEY);
    setViewAsMemberState(on);
    // Hai chế độ xem thử loại trừ nhau — bật member là tắt admin.
    if (on) {
      sessionStorage.removeItem(PREVIEW_ADMIN_KEY);
      setViewAsAdminState(false);
    }
  }

  /** Chỉ OWNER mới có gì để "hạ xuống admin" — admin thường bật cờ này là vô nghĩa. */
  function setViewAsAdmin(on: boolean) {
    if (!isRealOwner) return;
    if (on) sessionStorage.setItem(PREVIEW_ADMIN_KEY, '1');
    else sessionStorage.removeItem(PREVIEW_ADMIN_KEY);
    setViewAsAdminState(on);
    if (on) {
      sessionStorage.removeItem(PREVIEW_KEY);
      setViewAsMemberState(false);
    }
  }

  const value = useMemo<AuthState>(
    () => ({
      user,
      profile,
      // `role` là vai trò HIỆU LỰC nên chế độ xem thử phản chiếu đúng ở đây luôn.
      role: isRealAdmin && !viewAsMember ? 'admin' : 'member',
      isAdmin: isRealAdmin && !viewAsMember,
      // Xem như admin = mất độc quyền owner (sửa dự án, đổi vai trò) nhưng vẫn là admin.
      isOwner: isRealOwner && !viewAsMember && !viewAsAdmin,
      can,
      isRealAdmin,
      isRealOwner,
      viewAsMember,
      setViewAsMember,
      viewAsAdmin,
      setViewAsAdmin,
      loading,
      error,
      signIn,
      signOut,
      setRole,
      updateProfile,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, profile, loading, error, isRealAdmin, isRealOwner, viewAsMember, viewAsAdmin, rolePerms],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
