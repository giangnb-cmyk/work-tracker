import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRoles } from '../hooks/useRoles';
import type { TeamRole } from '../types';

/**
 * First-login popup: user mới chọn role của mình từ bảng `roles` (0072 — admin tạo,
 * kèm icon + bộ quyền). Blocking — đứng đó tới khi chọn xong (ghi profiles.role_id;
 * trigger DB tự đồng bộ job_role để icon khắp app hiện đúng).
 */
export default function RolePicker() {
  const { profile, setRole } = useAuth();
  const { roles, loading } = useRoles();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(role: TeamRole) {
    setSaving(role.id);
    setError(null);
    try {
      await setRole(role.id);
    } catch (err) {
      console.error('Chọn role thất bại', err);
      setError('Không lưu được. Thử lại nhé.');
      setSaving(null);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal fade-in" style={{ width: 'min(560px, 100%)' }}>
        <h2>Chào {profile?.displayName?.split(' ').slice(-1)[0] || 'bạn'} 👋</h2>
        <p className="muted" style={{ marginBottom: '1.25rem' }}>
          Bạn phụ trách mảng nào trong team? Chọn để hệ thống hiển thị đúng vai trò của bạn.
        </p>

        {loading && <p className="muted">Đang tải danh sách role…</p>}

        {!loading && roles.length === 0 && (
          <p className="muted">Chưa có role nào — nhờ admin tạo role trong tab Cấu hình rồi tải lại trang.</p>
        )}

        <div className="role-grid">
          {roles.map((r) => (
            <button
              key={r.id}
              className="role-card"
              disabled={saving !== null}
              onClick={() => pick(r)}
            >
              <span className="role-icon">{r.icon}</span>
              <span className="role-label">{r.name}</span>
              {saving === r.id && <span className="muted" style={{ fontSize: '0.72rem' }}>Đang lưu…</span>}
            </button>
          ))}
        </div>

        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
