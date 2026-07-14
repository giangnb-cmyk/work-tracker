import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { JOB_ROLES, type JobRole } from '../types';

/**
 * First-login popup: the user picks their job discipline. Blocking — it stays up
 * until a role is chosen (writes `jobRole` on their user doc).
 */
export default function RolePicker() {
  const { profile, setJobRole } = useAuth();
  const [saving, setSaving] = useState<JobRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(role: JobRole) {
    setSaving(role);
    setError(null);
    try {
      await setJobRole(role);
    } catch (err) {
      console.error('Set job role failed', err);
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

        <div className="role-grid">
          {JOB_ROLES.map((r) => (
            <button
              key={r.id}
              className="role-card"
              disabled={saving !== null}
              onClick={() => pick(r.id)}
            >
              <span className="role-icon">{r.icon}</span>
              <span className="role-label">{r.label}</span>
              {saving === r.id && <span className="muted" style={{ fontSize: '0.72rem' }}>Đang lưu…</span>}
            </button>
          ))}
        </div>

        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
