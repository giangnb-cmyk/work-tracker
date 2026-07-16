import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface ProfileModalProps {
  onClose: () => void;
}

/** Trả về câu tiếng Việt cho lỗi Postgres, hoặc câu chung nếu không nhận ra. */
function messageFor(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  // 23505 = unique_violation: Discord id đã có người khác nhận.
  if (code === '23505') {
    return 'Discord ID này đã gắn với tài khoản khác. Mỗi Discord ID chỉ thuộc về một người.';
  }
  return 'Lưu thất bại. Thử lại nhé.';
}

/**
 * Ai cũng tự sửa được hồ sơ của CHÍNH mình — mở bằng cách bấm tên ở góc sidebar.
 *
 * Cố ý KHÔNG cho sửa: email (khoá theo tài khoản Google), vai trò (RLS chặn tự phong
 * admin), và job role (đã có RolePicker riêng).
 */
export default function ProfileModal({ onClose }: ProfileModalProps) {
  const { profile, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [discordId, setDiscordId] = useState(profile?.discordId ?? '');
  const [notionUserId, setNotionUserId] = useState(profile?.notionUserId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!displayName.trim()) {
      setError('Cần nhập tên hiển thị.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateProfile({ displayName, discordId, notionUserId });
      onClose();
    } catch (err) {
      console.error('Lưu hồ sơ thất bại', err);
      setError(messageFor(err));
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Hồ sơ của tôi</h2>

        <label className="field">
          <span>Tên hiển thị *</span>
          <input
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoFocus
          />
        </label>

        <label className="field">
          <span>Discord ID</span>
          <input
            className="input"
            value={discordId}
            onChange={(e) => setDiscordId(e.target.value)}
            placeholder="592506826067804198"
            inputMode="numeric"
          />
          <span className="muted" style={{ fontSize: '0.78rem' }}>
            Bật Developer Mode trong Discord → chuột phải vào tên mình → Copy User ID.
            Chưa điền thì bot không biết bạn là ai khi bạn tag nó.
          </span>
        </label>

        <label className="field">
          <span>Notion User ID</span>
          <input
            className="input"
            value={notionUserId}
            onChange={(e) => setNotionUserId(e.target.value)}
            placeholder="UUID người dùng Notion"
          />
          <span className="muted" style={{ fontSize: '0.78rem' }}>
            Dùng để gán bạn vào page Notion khi task được đồng bộ.
          </span>
        </label>

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          <button className="btn-sm" onClick={onClose} disabled={saving}>Huỷ</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}
