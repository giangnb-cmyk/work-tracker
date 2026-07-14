import { useState } from 'react';
import { createMember, updateMember, type MemberInput } from '../lib/memberWrites';
import { JOB_ROLES, type JobRole, type TeamMember, type UserRole } from '../types';

interface MemberModalProps {
  member?: TeamMember | null; // null = add new
  onClose: () => void;
}

/** Admin dialog to add or edit a team member (role + Discord/Notion links). */
export default function MemberModal({ member, onClose }: MemberModalProps) {
  const isEdit = Boolean(member);
  const [displayName, setDisplayName] = useState(member?.displayName ?? '');
  const [email, setEmail] = useState(member?.email ?? '');
  const [role, setRole] = useState<UserRole>(member?.role ?? 'member');
  const [jobRole, setJobRole] = useState<JobRole>(member?.jobRole ?? 'developer');
  const [discordId, setDiscordId] = useState(member?.discordId ?? '');
  const [notionUserId, setNotionUserId] = useState(member?.notionUserId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!displayName.trim()) {
      setError('Cần nhập tên thành viên.');
      return;
    }
    setSaving(true);
    setError(null);
    const input: MemberInput = { displayName, email, role, jobRole, discordId, notionUserId };
    try {
      if (isEdit && member) {
        await updateMember(member.uid, {
          displayName: displayName.trim(),
          email: email.trim(),
          role,
          jobRole,
          discordId: discordId.trim(),
          notionUserId: notionUserId.trim(),
        });
      } else {
        await createMember(input);
      }
      onClose();
    } catch (err) {
      console.error('Save member failed', err);
      setError('Lưu thất bại. Cần quyền admin.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? 'Sửa thành viên' : 'Thêm thành viên'}</h2>

        <label className="field">
          <span>Tên hiển thị *</span>
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Email</span>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@easygoing.vn" />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Vai trò</span>
            <select className="select" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="member">Thành viên</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="field">
            <span>Discord User ID</span>
            <input className="input" value={discordId} onChange={(e) => setDiscordId(e.target.value)} placeholder="ví dụ 123456789012345678" />
          </label>
        </div>
        <label className="field">
          <span>Chuyên môn</span>
          <select className="select" value={jobRole} onChange={(e) => setJobRole(e.target.value as JobRole)}>
            {JOB_ROLES.map((r) => (
              <option key={r.id} value={r.id}>{r.icon} {r.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Notion User ID (tuỳ chọn)</span>
          <input className="input" value={notionUserId} onChange={(e) => setNotionUserId(e.target.value)} />
        </label>

        <p className="muted" style={{ fontSize: '0.78rem', marginBottom: '0.75rem' }}>
          💡 Discord User ID (không phải username): bật Developer Mode trong Discord → chuột phải vào người đó → Copy User ID.
          Dùng để mention khi task hoàn thành.
        </p>
        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          <button className="btn-sm" onClick={onClose} disabled={saving}>Huỷ</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Đang lưu…' : isEdit ? 'Lưu' : 'Thêm'}
          </button>
        </div>
      </div>
    </div>
  );
}
