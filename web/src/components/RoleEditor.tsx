import { useEffect, useMemo, useRef, useState } from 'react';
import { useRoles } from '../hooks/useRoles';
import { updateRole } from '../lib/roleWrites';
import ConfirmDialog from './ConfirmDialog';
import EmojiPicker from './EmojiPicker';
import Switch from './Switch';
import { MEMBER_PERMS, type MemberPerm, type TeamRole } from '../types';

interface Props {
  roleId: string;
  /** roleId -> số người đang mang. Cha đã tính, đừng tính lại. */
  counts: Map<string, number>;
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
  roleId, counts, onBack, onPick, onCreate, onDelete,
  confirmDel, onConfirmDelete, onCancelDelete,
}: Props) {
  const { roles } = useRoles();
  const role = roles.find((r) => r.id === roleId) ?? null;

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

  // Nạp form khi ĐỔI role (kể cả lần đầu). Không phụ thuộc `roles` để realtime đẩy về một
  // nhịp cập nhật không ghi đè thứ người dùng đang gõ dở.
  useEffect(() => {
    const r = roles.find((x) => x.id === roleId);
    if (!r) return;
    setName(r.name);
    setIcon(r.icon);
    setPerms(r.perms);
    lastSavedRef.current = snapshot(r.name, r.icon, r.perms);
    setSaveState('idle');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleId]);

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
              <span className="field-label">Đang mang role này</span>
              <p className="fk-hint">
                {(counts.get(role.id) ?? 0) === 0
                  ? 'Chưa có ai. Gán role cho từng người ở tab Thành viên.'
                  : `${counts.get(role.id)} người. Gán/đổi ở tab Thành viên.`}
              </p>
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

            {shownPerms.map((p) => (
              <div key={p.id} className="perm-item">
                <div className="perm-item-text">
                  <div className="perm-item-label">{p.label}</div>
                  <p className="perm-item-hint muted">{p.hint}</p>
                </div>
                <Switch
                  checked={perms.includes(p.id)}
                  onChange={(on) => togglePerm(p.id, on)}
                  label=""
                  ariaLabel={`Bật/tắt quyền ${p.label}`}
                />
              </div>
            ))}
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
