import { useState } from 'react';
import Avatar from '../Avatar';
import RatingPicker from './RatingPicker';
import MemberNoteLog from './MemberNoteLog';
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

type Tab = 'note' | 'history';

/**
 * Popup ghi chú cho MỘT người trong MỘT sprint, hai tab: "Ghi chú" (form, mô hình một note/sprint,
 * Lưu = ghi đè) và "Lịch sử" (nhật ký các sprint). Lưu xong thì XOÁ TRẮNG form (đã lưu rồi) và nạp
 * lại nhật ký thay vì đóng, để ghi tiếp/đối chiếu ngay. Mở từ danh sách trong `SprintNotesPanel`.
 */
export default function MemberNoteModal({ member, sprintId, sprintName, note, authorId, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('note');
  const [overview, setOverview] = useState(note?.overview ?? '');
  const [highlights, setHighlights] = useState(note?.highlights ?? '');
  const [concerns, setConcerns] = useState(note?.concerns ?? '');
  const [rating, setRating] = useState<number | null>(note?.rating ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tăng để ép tab "Lịch sử" nạp lại sau mỗi lần lưu.
  const [logKey, setLogKey] = useState(0);

  // Form rỗng hoàn toàn → chặn Lưu: tránh ghi đè note đã có bằng nội dung trắng.
  const isEmpty = !overview.trim() && !highlights.trim() && !concerns.trim() && rating == null;

  function clearForm() {
    setOverview('');
    setHighlights('');
    setConcerns('');
    setRating(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await upsertMemberSprintNote(member.uid, sprintId, { overview, highlights, concerns, rating }, authorId);
      clearForm();
      setLogKey((k) => k + 1); // nhật ký nạp lại để thấy note vừa lưu
      setTab('history');
    } catch (err) {
      console.error('Lưu ghi chú thất bại', err);
      setError(err instanceof Error ? err.message : 'Lưu thất bại (cần quyền admin).');
    } finally {
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

        <div className="seg-toggle mm-tabs">
          <button type="button" className={`seg${tab === 'note' ? ' on' : ''}`} onClick={() => setTab('note')}>📝 Ghi chú</button>
          <button type="button" className={`seg${tab === 'history' ? ' on' : ''}`} onClick={() => setTab('history')}>🕑 Lịch sử</button>
        </div>

        <div className="mm-tab-body">
          {tab === 'note' ? (
            <>
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
            </>
          ) : (
            <MemberNoteLog memberId={member.uid} reloadKey={logKey} />
          )}
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          <button className="btn-sm" onClick={onClose} disabled={saving}>Đóng</button>
          {tab === 'note' && (
            <button className="btn-primary" onClick={handleSave} disabled={saving || isEmpty}>
              {saving ? 'Đang lưu…' : 'Lưu'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
