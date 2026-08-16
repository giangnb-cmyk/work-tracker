import { useState } from 'react';
import { useRoles } from '../hooks/useRoles';
import { createRole, deleteRole, updateRole } from '../lib/roleWrites';
import { MEMBER_PERMS, type MemberPerm, type TeamRole } from '../types';

/** Emoji gợi ý cho ô icon — gõ tay emoji khác vẫn được. */
const ICON_SUGGESTIONS = ['💻', '🎨', '🎮', '🎵', '🖌️', '🎞️', '✨', '🐞', '📊', '🧭', '🛠️', '👑'];

/**
 * Admin CRUD role động (bảng roles, 0072) — tab Cấu hình. Mỗi role: tên + icon + bộ
 * quyền; user mới đăng nhập chọn role từ list này (RolePicker), quyền theo role gộp
 * trong has_perm()/can().
 */
export default function RoleManager() {
  const { roles } = useRoles();
  // editing: null = đóng form; '' = tạo mới; id = sửa role đó.
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('👤');
  const [perms, setPerms] = useState<MemberPerm[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setEditing('');
    setName('');
    setIcon('👤');
    setPerms([]);
    setError(null);
  }

  function openEdit(r: TeamRole) {
    setEditing(r.id);
    setName(r.name);
    setIcon(r.icon);
    setPerms(r.perms);
    setError(null);
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Cần nhập tên role.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await updateRole(editing, { name, icon, perms });
      } else {
        const maxSort = roles.reduce((m, r) => Math.max(m, r.sort), 0);
        await createRole({ name, icon, perms }, maxSort + 1);
      }
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lưu role thất bại.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(r: TeamRole) {
    if (!window.confirm(`Xoá role "${r.name}"? Người đang mang role này sẽ về "chưa chọn role".`)) return;
    try {
      await deleteRole(r.id);
      if (editing === r.id) setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xoá role thất bại.');
    }
  }

  function permLabels(r: TeamRole): string {
    const names = MEMBER_PERMS.filter((p) => r.perms.includes(p.id)).map((p) => p.label);
    return names.length ? names.join(', ') : 'Không kèm quyền thêm';
  }

  return (
    <div className="glass section" style={{ padding: '1.5rem', maxWidth: 720, marginTop: '1.25rem' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3>Role trong team</h3>
        <button className="btn-sm" onClick={openCreate}>＋ Tạo role</button>
      </div>
      <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
        User mới đăng nhập sẽ chọn một role trong list này. Quyền tick cho role sẽ tự áp cho
        mọi người mang nó (admin/owner luôn có đủ quyền, không cần role).
      </p>

      <div className="rolemgr-list">
        {roles.map((r) => (
          <div key={r.id} className="rolemgr-row">
            <span className="rolemgr-icon">{r.icon}</span>
            <span className="rolemgr-name">{r.name}</span>
            <span className="rolemgr-perms muted">{permLabels(r)}</span>
            <span className="rolemgr-actions">
              <button className="btn-sm" onClick={() => openEdit(r)}>Sửa</button>
              <button className="btn-sm danger" onClick={() => void handleDelete(r)}>Xoá</button>
            </span>
          </div>
        ))}
        {roles.length === 0 && <p className="muted">Chưa có role nào.</p>}
      </div>

      {editing !== null && (
        <div className="rolemgr-form">
          <div className="grid-2">
            <label className="field">
              <span>Tên role *</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tech Lead" autoFocus />
            </label>
            <label className="field">
              <span>Icon (emoji)</span>
              <input className="input" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={8} />
            </label>
          </div>
          <div className="rolemgr-icon-row">
            {ICON_SUGGESTIONS.map((e) => (
              <button
                key={e}
                type="button"
                className={`rolemgr-icon-btn${icon === e ? ' on' : ''}`}
                onClick={() => setIcon(e)}
              >
                {e}
              </button>
            ))}
          </div>

          <div className="field">
            <span className="field-label">Quyền kèm theo role</span>
            <div className="perm-list">
              {MEMBER_PERMS.map((p) => (
                <label key={p.id} className="perm-row">
                  <input
                    type="checkbox"
                    checked={perms.includes(p.id)}
                    onChange={(e) =>
                      setPerms((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id)))
                    }
                  />
                  <span>
                    {p.label}
                    <small className="muted"> — {p.hint}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="row" style={{ gap: '0.75rem' }}>
            <button className="btn-primary" onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Đang lưu…' : editing ? 'Lưu role' : 'Tạo role'}
            </button>
            <button className="btn-sm" onClick={() => setEditing(null)}>Huỷ</button>
            {error && <span className="error-text" style={{ margin: 0 }}>{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
