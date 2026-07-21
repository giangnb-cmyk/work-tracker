import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { addProjectMembers } from '../lib/projectMemberWrites';
import { foldDiacritics } from '../lib/text';
import Avatar from './Avatar';
import { JOB_ROLE_LABEL } from '../types';

interface Props {
  projectId: string;
  /** uid những người ĐÃ ở trong dự án — ẩn khỏi danh sách chọn. */
  existingIds: Set<string>;
  onClose: () => void;
}

/**
 * Chọn người từ roster TOÀN WEB để thêm vào một dự án. Chỉ liệt kê người chưa ở trong
 * dự án; tìm kiếm bỏ dấu (foldDiacritics) vì roster sẽ đông dần.
 */
export default function ProjectMemberPicker({ projectId, existingIds, onClose }: Props) {
  const { profile } = useAuth();
  const { members } = useSprintContext();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(() => {
    const q = foldDiacritics(query.trim());
    return members
      .filter((m) => !existingIds.has(m.uid))
      .filter((m) => !q || foldDiacritics(`${m.displayName} ${m.email}`).includes(q))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'));
  }, [members, existingIds, query]);

  function toggle(uid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  async function handleAdd() {
    if (selected.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      await addProjectMembers(projectId, [...selected], profile?.uid ?? null);
      onClose();
    } catch (err) {
      console.error('Thêm thành viên vào dự án thất bại', err);
      setError('Thêm thất bại (cần quyền admin).');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Thêm thành viên vào dự án</h2>
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Chọn từ những người đã đăng nhập web. Người chưa từng vào web thì tạo hồ sơ ở
          “Thành viên” (trang chọn dự án) trước.
        </p>

        <input
          className="input"
          type="search"
          placeholder="Tìm theo tên hoặc email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          style={{ marginBottom: '0.6rem' }}
        />

        <div className="picker-list">
          {candidates.length === 0 ? (
            <p className="muted" style={{ padding: '0.75rem', margin: 0 }}>
              {members.length === existingIds.size
                ? 'Mọi người đã ở trong dự án rồi.'
                : 'Không tìm thấy ai khớp.'}
            </p>
          ) : (
            candidates.map((m) => (
              <label key={m.uid} className={`picker-row${selected.has(m.uid) ? ' on' : ''}`}>
                <input type="checkbox" checked={selected.has(m.uid)} onChange={() => toggle(m.uid)} />
                <Avatar name={m.displayName} photoURL={m.photoURL} size="sm" />
                <span className="picker-name">
                  {m.displayName}
                  <small className="muted"> · {m.jobRole ? JOB_ROLE_LABEL[m.jobRole] : m.email || '—'}</small>
                </span>
              </label>
            ))
          )}
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          <button className="btn-sm" onClick={onClose} disabled={saving}>Huỷ</button>
          <button className="btn-primary" onClick={handleAdd} disabled={saving || selected.size === 0}>
            {saving ? 'Đang thêm…' : `Thêm ${selected.size > 0 ? `(${selected.size})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
