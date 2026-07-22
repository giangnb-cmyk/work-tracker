import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSprintContext } from '../../contexts/SprintContext';
import { useSprintNotes } from '../../hooks/useMemberSprintNotes';
import MemberNoteCard from './MemberNoteCard';

/**
 * Chọn sprint → điền ghi chú đánh giá cho từng người trong team. Members lấy từ SprintContext
 * (KHÔNG gọi useMembers() lần nữa — trùng channel realtime `profiles`, xem MemberDmTest).
 */
export default function SprintNotesPanel() {
  const { profile, isAdmin } = useAuth();
  const { sprints, activeSprint, members } = useSprintContext();
  const [sprintId, setSprintId] = useState(activeSprint?.id ?? sprints[0]?.id ?? '');
  const { byMember, loading } = useSprintNotes(sprintId || null, isAdmin);

  return (
    <div className="glass section" style={{ padding: '1.25rem', marginTop: '1rem' }}>
      <label className="field" style={{ maxWidth: 320 }}>
        <span>Sprint</span>
        <select className="select" value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
          {sprints.length === 0 && <option value="">— chưa có sprint —</option>}
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>

      {!sprintId ? (
        <p className="muted">Chưa có sprint nào để ghi chú.</p>
      ) : members.length === 0 ? (
        <p className="muted">Chưa có thành viên nào.</p>
      ) : (
        <div className="review-grid">
          {members.map((m) => (
            <MemberNoteCard
              key={m.uid}
              member={m}
              sprintId={sprintId}
              note={byMember.get(m.uid)}
              authorId={profile?.uid ?? null}
            />
          ))}
        </div>
      )}
      {loading && sprintId && <p className="muted" style={{ marginTop: '0.75rem' }}>Đang tải ghi chú…</p>}
    </div>
  );
}
