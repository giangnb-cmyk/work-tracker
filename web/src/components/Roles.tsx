import { useMemo, useState } from 'react';
import { useRoles } from '../hooks/useRoles';
import { useMembers } from '../hooks/useMembers';
import { createRole, deleteRole } from '../lib/roleWrites';
import ConfirmDialog from './ConfirmDialog';
import RoleEditor from './RoleEditor';
import { DEFAULT_MEMBER_PERMS, MEMBER_PERMS, type TeamRole } from '../types';


/**
 * Tab **Role** (khu quản trị) — trước đây nằm lọt trong tab Cấu hình, giờ đứng riêng.
 *
 * Bố cục mượn Discord: danh sách role (tìm kiếm + đếm người + sửa/xoá) → bấm sửa thì mở
 * màn chi tiết hai cột (list role bên trái, tab Hiển thị/Quyền bên phải — {@link RoleEditor}).
 * Chỉ mượn CÁCH BÀY, còn màu/chữ vẫn theo design system của app.
 */
export default function Roles() {
  const { roles, loading } = useRoles();
  const { members } = useMembers();
  /** Bao nhiêu người đang mang mỗi role (theo `profiles.role_id`). */
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of members) {
      if (p.roleId) m.set(p.roleId, (m.get(p.roleId) ?? 0) + 1);
    }
    return m;
  }, [members]);
  const [q, setQ] = useState('');
  /** id role đang mở màn sửa; '' = vừa tạo role mới nên chưa biết id; null = đang ở list. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<TeamRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? roles.filter((r) => r.name.toLowerCase().includes(needle)) : roles;
  }, [roles, q]);

  /** Tạo role trống rồi NHẢY THẲNG vào màn sửa — Discord cũng vậy, và nó đúng: vừa bấm
   *  "Tạo role" là người ta đang muốn đặt tên + tick quyền, không phải ngắm một dòng trống. */
  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const maxSort = roles.reduce((m, r) => Math.max(m, r.sort), 0);
      // Role mới mang sẵn bộ quyền "bật sẵn" (0082) — admin vào tắt bớt, thay vì tick lại từ đầu.
      const id = await createRole({ name: 'Role mới', icon: '👤', perms: [...DEFAULT_MEMBER_PERMS] }, maxSort + 1);
      setEditingId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo role thất bại (cần quyền admin).');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(r: TeamRole) {
    try {
      await deleteRole(r.id);
      setConfirmDel(null);
      if (editingId === r.id) setEditingId(null);
    } catch (err) {
      setConfirmDel(null);
      setError(err instanceof Error ? err.message : 'Xoá role thất bại.');
    }
  }

  if (editingId !== null) {
    return (
      <RoleEditor
        roleId={editingId}
        roles={roles}
        counts={counts}
        members={members}
        onBack={() => setEditingId(null)}
        onPick={setEditingId}
        onCreate={handleCreate}
        onDelete={(r) => setConfirmDel(r)}
        confirmDel={confirmDel}
        onConfirmDelete={handleDelete}
        onCancelDelete={() => setConfirmDel(null)}
      />
    );
  }

  return (
    <div className="fade-in">
      <div className="view-header">
        <h1>Role</h1>
        <p>Gom thành viên theo vai trò và cấp quyền cho cả nhóm một lần.</p>
      </div>

      <div className="role-toolbar">
        <span className="role-search">
          <span className="role-search-icon" aria-hidden>🔍</span>
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm role…"
          />
        </span>
        <button className="btn-primary" onClick={() => void handleCreate()} disabled={creating}>
          {creating ? 'Đang tạo…' : 'Tạo role'}
        </button>
      </div>
      <p className="muted role-hint">
        Quyền tick cho role tự áp cho mọi người mang nó. Admin/owner luôn có đủ quyền nên
        không cần role.
      </p>

      {error && <p className="error-text">{error}</p>}

      {loading ? (
        <div className="center-screen" style={{ minHeight: 160 }}><div className="spinner" /></div>
      ) : (
        <div className="glass role-table">
          <div className="role-thead">
            <span>ROLE — {roles.length}</span>
            <span className="role-col-members">THÀNH VIÊN</span>
            <span />
          </div>

          {shown.map((r) => (
            <div key={r.id} className="role-row" onClick={() => setEditingId(r.id)} title="Sửa role">
              <span className="role-cell-name">
                <span className="role-dot" aria-hidden>{r.icon}</span>
                <span className="role-name">{r.name}</span>
                <span className="role-permcount muted">
                  {r.perms.length === 0
                    ? 'không kèm quyền'
                    : `${r.perms.length}/${MEMBER_PERMS.length} quyền`}
                </span>
              </span>
              <span className="role-col-members mono">
                {counts.get(r.id) ?? 0} <span aria-hidden>👤</span>
              </span>
              <span className="role-row-actions">
                <button
                  className="btn-sm"
                  title="Sửa role"
                  onClick={(e) => { e.stopPropagation(); setEditingId(r.id); }}
                >
                  ✏️
                </button>
                <button
                  className="btn-sm danger"
                  title="Xoá role"
                  onClick={(e) => { e.stopPropagation(); setConfirmDel(r); }}
                >
                  🗑
                </button>
              </span>
            </div>
          ))}

          {shown.length === 0 && (
            <p className="empty">{roles.length === 0 ? 'Chưa có role nào.' : 'Không có role nào khớp.'}</p>
          )}
        </div>
      )}

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
          onConfirm={() => handleDelete(confirmDel)}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}
