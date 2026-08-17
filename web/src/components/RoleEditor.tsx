import { useEffect, useMemo, useRef, useState } from 'react';
import { updateRole } from '../lib/roleWrites';
import Avatar from './Avatar';
import ConfirmDialog from './ConfirmDialog';
import EmojiPicker from './EmojiPicker';
import Switch from './Switch';
import { DEFAULT_MEMBER_PERMS, MEMBER_PERMS, type MemberPerm, type TeamMember, type TeamRole } from '../types';

interface Props {
  roleId: string;
  /**
   * Danh sách role — NHẬN TỪ CHA, không tự gọi `useRoles()` lần nữa.
   *
   * Bản đầu gọi hook riêng ở đây và dính bug thật: hook là instance độc lập nên lần mount
   * đầu `roles` còn rỗng, effect nạp form không tìm thấy role rồi thoát, ô "Tên role" trống
   * trong khi tiêu đề vẫn hiện tên (tiêu đề đọc `roles` ở render sau). Nhận từ cha thì dữ
   * liệu CÓ SẴN ngay từ render đầu — hết cửa hở, và bớt một socket realtime.
   */
  roles: TeamRole[];
  /** roleId -> số người đang mang. Cha đã tính, đừng tính lại. */
  counts: Map<string, number>;
  /** Toàn bộ thành viên — để liệt kê ai đang mang role đang mở. */
  members: TeamMember[];
  onBack: () => void;
  onPick: (id: string) => void;
  onCreate: () => void | Promise<void>;
  onDelete: (r: TeamRole) => void;
  confirmDel: TeamRole | null;
  onConfirmDelete: (r: TeamRole) => void | Promise<void>;
  onCancelDelete: () => void;
}

type Pane = 'display' | 'perms';

/**
 * Màn SỬA role — hai cột kiểu Discord: cột trái là toàn bộ role (bấm để nhảy sang cái
 * khác mà không phải quay ra list), cột phải là hai thẻ **Hiển thị** / **Quyền**.
 *
 * Tự lưu có trễ như TaskModal/FeatureModal: màn này chỉ có vài ô, bắt bấm "Lưu" xong mới
 * thấy tác dụng là thừa một nhịp. Đổi role đang xem thì đẩy nốt bản nháp trước khi nhảy.
 */
export default function RoleEditor({
  roleId, roles, counts, members, onBack, onPick, onCreate, onDelete,
  confirmDel, onConfirmDelete, onCancelDelete,
}: Props) {
  const role = roles.find((r) => r.id === roleId) ?? null;
  const holders = useMemo(
    () => members.filter((m) => m.roleId === roleId).sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi')),
    [members, roleId],
  );

  const [pane, setPane] = useState<Pane>('display');
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('👤');
  const [perms, setPerms] = useState<MemberPerm[]>([]);
  const [permQ, setPermQ] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string | null>(null);
  const snapshot = (n = name, i = icon, p = perms) => JSON.stringify({ n, i, p: [...p].sort() });

  /**
   * Role đã nạp vào form. Phải theo dõi bằng ref chứ không chỉ dựa vào `[roleId]`:
   * `useRoles()` ở đây là instance RIÊNG với instance của màn danh sách, nên lần mount đầu
   * `roles` còn rỗng — effect chạy, không tìm thấy role, thoát; và vì deps chỉ có `roleId`
   * nên khi dữ liệu về nó KHÔNG chạy lại → ô Tên role trống vĩnh viễn (đã bị báo lỗi thật).
   * Có ref thì cứ nghe cả `roles`, nhưng chỉ nạp đúng MỘT lần cho mỗi role → realtime đẩy
   * về giữa chừng cũng không ghi đè thứ đang gõ dở.
   */
  const loadedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (loadedForRef.current === roleId) return;
    const r = roles.find((x) => x.id === roleId);
    if (!r) return;
    loadedForRef.current = roleId;
    setName(r.name);
    setIcon(r.icon);
    setPerms(r.perms);
    lastSavedRef.current = snapshot(r.name, r.icon, r.perms);
    setSaveState('idle');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleId, roles]);

  async function persist(): Promise<void> {
    if (!role) return;
    if (!name.trim()) {
      setError('Cần nhập tên role.');
      setSaveState('error');
      return;
    }
    const pending = snapshot();
    setSaveState('saving');
    setError(null);
    try {
      await updateRole(role.id, { name: name.trim(), icon, perms });
      lastSavedRef.current = pending;
      setSaveState('saved');
    } catch (err) {
      setSaveState('error');
      setError(err instanceof Error ? err.message : 'Lưu role thất bại (cần quyền admin).');
    }
  }

  useEffect(() => {
    if (!role) return;
    if (snapshot() === lastSavedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void persist(), 600);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, icon, perms]);

  /** Rời màn/đổi role: đẩy nốt bản nháp đang chờ, kẻo bấm nhanh là mất. */
  async function flushThen(go: () => void) {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (role && snapshot() !== lastSavedRef.current) await persist();
    go();
  }

  const shownPerms = useMemo(() => {
    const needle = permQ.trim().toLowerCase();
    if (!needle) return MEMBER_PERMS;
    return MEMBER_PERMS.filter(
      (p) => p.label.toLowerCase().includes(needle) || p.hint.toLowerCase().includes(needle),
    );
  }, [permQ]);

  function togglePerm(id: MemberPerm, on: boolean) {
    setPerms((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  const saveHint =
    saveState === 'saving' ? 'Đang lưu…' :
    saveState === 'error' ? '⚠ Lưu lỗi' :
    saveState === 'saved' ? '✓ Đã lưu' : 'Tự động lưu';

  return (
    <div className="fade-in role-editor">
      {/* Cột trái: mọi role, nhảy qua lại không cần quay ra list */}
      <aside className="role-side">
        <div className="role-side-top">
          <button className="btn-sm" onClick={() => void flushThen(onBack)}>← Danh sách</button>
          <button className="btn-sm" title="Tạo role mới" onClick={() => void flushThen(() => void onCreate())}>＋</button>
        </div>
        <div className="role-side-list">
          {roles.map((r) => (
            <button
              key={r.id}
              className={`role-side-item${r.id === roleId ? ' on' : ''}`}
              onClick={() => void flushThen(() => onPick(r.id))}
            >
              <span aria-hidden>{r.icon}</span>
              <span className="role-side-name">{r.name}</span>
              <span className="muted mono">{counts.get(r.id) ?? 0}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="glass role-pane">
        <div className="role-pane-head">
          <h2>SỬA ROLE — {(role?.name ?? '').toUpperCase()}</h2>
          <div className="row" style={{ gap: '0.5rem' }}>
            <span className={`tm-savehint tm-save-${saveState}`}>{saveHint}</span>
            {role && (
              <button className="btn-sm danger" onClick={() => onDelete(role)}>🗑 Xoá role</button>
            )}
          </div>
        </div>

        <div className="role-tabs">
          <button className={`role-tab${pane === 'display' ? ' on' : ''}`} onClick={() => setPane('display')}>
            Hiển thị
          </button>
          <button className={`role-tab${pane === 'perms' ? ' on' : ''}`} onClick={() => setPane('perms')}>
            Quyền <span className="muted mono">{perms.length}</span>
          </button>
        </div>

        {!role ? (
          <p className="empty">Role này không còn nữa.</p>
        ) : pane === 'display' ? (
          <div className="role-pane-body">
            <label className="field">
              <span>Tên role *</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </label>

            <div className="field">
              <span className="field-label">Icon</span>
              <div className="row" style={{ gap: '0.6rem', alignItems: 'center' }}>
                <span className="role-icon-preview" aria-hidden>{icon}</span>
                <EmojiPicker value={icon} onChange={setIcon} />
              </div>
              <p className="fk-hint">Icon hiện cạnh tên role ở mọi chỗ hiển thị thành viên.</p>
            </div>

            <div className="field">
              <span className="field-label">Đang mang role này — {holders.length} người</span>
              {holders.length === 0 ? (
                <p className="fk-hint">Chưa có ai. Gán role cho từng người ở tab Thành viên.</p>
              ) : (
                <>
                  <div className="role-holders">
                    {holders.map((m) => (
                      <span key={m.uid} className="role-holder" title={m.email}>
                        <Avatar name={m.displayName} photoURL={m.photoURL} size="sm" />
                        <span className="role-holder-name">{m.displayName || m.email}</span>
                      </span>
                    ))}
                  </div>
                  <p className="fk-hint">Gán/đổi role cho từng người ở tab Thành viên.</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="role-pane-body">
            <span className="role-search role-search-wide">
              <span className="role-search-icon" aria-hidden>🔍</span>
              <input
                className="input"
                value={permQ}
                onChange={(e) => setPermQ(e.target.value)}
                placeholder="Tìm quyền…"
              />
            </span>

            {shownPerms.map((p) => {
              // Quyền mặc định (0079): AI CŨNG có sẵn, role không cấp thêm được gì. Hiện
              // công tắc bật + khoá thay vì giấu đi — giấu thì admin tưởng chưa ai có quyền
              // đó; mà để bấm được thì bấm xong chẳng đổi gì, còn khó hiểu hơn.
              const isDefault = DEFAULT_MEMBER_PERMS.includes(p.id);
              return (
                <div key={p.id} className={`perm-item${isDefault ? ' is-default' : ''}`}>
                  <div className="perm-item-text">
                    <div className="perm-item-label">
                      {p.label}
                      {isDefault && <span className="perm-default-tag">Mặc định cho mọi người</span>}
                    </div>
                    <p className="perm-item-hint muted">
                      {p.hint}
                      {isDefault && ' — mọi thành viên đã có sẵn quyền này, không cần role.'}
                    </p>
                  </div>
                  <Switch
                    checked={isDefault || perms.includes(p.id)}
                    onChange={(on) => togglePerm(p.id, on)}
                    disabled={isDefault}
                    label=""
                    ariaLabel={`Bật/tắt quyền ${p.label}`}
                  />
                </div>
              );
            })}
            {shownPerms.length === 0 && <p className="empty">Không có quyền nào khớp.</p>}
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
      </section>

      {confirmDel && (
        <ConfirmDialog
          title="Xoá role?"
          message={<>Role <strong>“{confirmDel.name}”</strong> sẽ bị xoá.</>}
          detail={
            (counts.get(confirmDel.id) ?? 0) > 0
              ? `${counts.get(confirmDel.id)} người đang mang role này sẽ về "chưa chọn role", và MẤT các quyền role đó cấp. Không khôi phục được.`
              : 'Chưa ai mang role này. Không khôi phục được.'
          }
          confirmLabel="Xoá role"
          onConfirm={() => onConfirmDelete(confirmDel)}
          onCancel={onCancelDelete}
        />
      )}
    </div>
  );
}
