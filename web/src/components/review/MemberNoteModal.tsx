import { useState } from 'react';
import Avatar from '../Avatar';
import RatingPicker from './RatingPicker';
import { upsertMemberSprintNote } from '../../lib/memberReviewWrites';
import type { MemberSprintNote, TeamMember } from '../../types';

interface Props {
  member: TeamMember;
  sprintId: string;
  sprintName: string;
  /** Ghi chú đã lưu trước đó của (người, sprint) này — điền sẵn form để xem + sửa. */
  note?: MemberSprintNote;
  authorId: string | null;
  onClose: () => void;
}

/**
 * Popup điền ghi chú cho MỘT người trong MỘT sprint. Điền sẵn nội dung đã note từ trước (mô hình
 * một note/sprint, Lưu = ghi đè). Mở từ danh sách trong `SprintNotesPanel`.
 */
export default function MemberNoteModal({ member, sprintId, sprintName, note, authorId, onClose }: Props) {
  const [overview, setOverview] = useState(note?.overview ?? '');
  const [highlights, setHighlights] = useState(note?.highlights ?? '');
  const [concerns, setConcerns] = useState(note?.concerns ?? '');
  const [rating, setRating] = useState<number | null>(note?.rating ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await upsertMemberSprintNote(member.uid, sprintId, { overview, highlights, concerns, rating }, authorId);
      onClose();
    } catch (err) {
      console.error('Lưu ghi chú thất bại', err);
      setError(err instanceof Error ? err.message : 'Lưu thất bại (cần quyền admin).');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal member-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="mnm-title">
          <Avatar name={member.displayName} photoURL={member.photoURL} size="sm" />
          <span>{member.displayName}</span>
        </h2>
        <p className="muted" style={{ marginTop: '-0.5rem', marginBottom: '0.9rem' }}>Ghi chú · {sprintName}</p>

        <label className="field">
          <span>Tổng quan</span>
          <textarea className="textarea" value={overview} onChange={(e) => setOverview(e.target.value)} placeholder="Tuần này làm việc thế nào…" autoFocus />
        </label>
        <label className="field">
          <span>Điểm nổi bật</span>
          <textarea className="textarea" value={highlights} onChange={(e) => setHighlights(e.target.value)} placeholder="Điều làm tốt, đáng ghi nhận…" />
        </label>
        <label className="field">
          <span>Điểm cần lưu ý</span>
          <textarea className="textarea" value={concerns} onChange={(e) => setConcerns(e.target.value)} placeholder="Điều cần cải thiện, cần theo dõi…" />
        </label>
        <div className="field">
          <span className="field-label">Mức đánh giá</span>
          <RatingPicker value={rating} onChange={setRating} />
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          <button className="btn-sm" onClick={onClose} disabled={saving}>Huỷ</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu'}</button>
        </div>
      </div>
    </div>
  );
}
