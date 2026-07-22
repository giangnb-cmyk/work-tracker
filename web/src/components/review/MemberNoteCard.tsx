import { useEffect, useRef, useState } from 'react';
import Avatar from '../Avatar';
import RatingPicker from './RatingPicker';
import { upsertMemberSprintNote } from '../../lib/memberReviewWrites';
import type { MemberSprintNote, TeamMember } from '../../types';

interface Props {
  member: TeamMember;
  sprintId: string;
  note?: MemberSprintNote;
  authorId: string | null;
}

/**
 * Card điền ghi chú đánh giá cho MỘT người trong sprint đang chọn. Lưu TAY (không autosave) để
 * không đua với refetch realtime. Seed từ `note`; đổi sprint hoặc note DB đổi (máy khác ghi) thì
 * nạp lại ô — khoá theo (sprintId + mốc updatedAt).
 */
export default function MemberNoteCard({ member, sprintId, note, authorId }: Props) {
  const [overview, setOverview] = useState(note?.overview ?? '');
  const [highlights, setHighlights] = useState(note?.highlights ?? '');
  const [concerns, setConcerns] = useState(note?.concerns ?? '');
  const [rating, setRating] = useState<number | null>(note?.rating ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  const seedKey = `${sprintId}:${note?.updatedAt?.toMillis() ?? 'none'}`;
  const seededRef = useRef('');
  useEffect(() => {
    if (seededRef.current === seedKey) return;
    seededRef.current = seedKey;
    setOverview(note?.overview ?? '');
    setHighlights(note?.highlights ?? '');
    setConcerns(note?.concerns ?? '');
    setRating(note?.rating ?? null);
    setSaved(false);
  }, [seedKey, note]);

  const dirty =
    overview !== (note?.overview ?? '') ||
    highlights !== (note?.highlights ?? '') ||
    concerns !== (note?.concerns ?? '') ||
    rating !== (note?.rating ?? null);

  async function handleSave() {
    setSaving(true);
    setError(false);
    try {
      await upsertMemberSprintNote(member.uid, sprintId, { overview, highlights, concerns, rating }, authorId);
      setSaved(true);
    } catch (err) {
      console.error('Lưu ghi chú thất bại', err);
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass member-note-card">
      <div className="mnc-head">
        <Avatar name={member.displayName} photoURL={member.photoURL} size="sm" />
        <span className="mnc-head-name">{member.displayName}</span>
        <RatingPicker value={rating} onChange={(v) => { setRating(v); setSaved(false); }} />
      </div>
      <label className="mnc-field">
        <span>Tổng quan</span>
        <textarea
          className="textarea mnc-textarea"
          value={overview}
          onChange={(e) => { setOverview(e.target.value); setSaved(false); }}
          placeholder="Tuần này làm việc thế nào…"
        />
      </label>
      <label className="mnc-field">
        <span>Điểm nổi bật</span>
        <textarea
          className="textarea mnc-textarea"
          value={highlights}
          onChange={(e) => { setHighlights(e.target.value); setSaved(false); }}
          placeholder="Điều làm tốt, đáng ghi nhận…"
        />
      </label>
      <label className="mnc-field">
        <span>Điểm cần lưu ý</span>
        <textarea
          className="textarea mnc-textarea"
          value={concerns}
          onChange={(e) => { setConcerns(e.target.value); setSaved(false); }}
          placeholder="Điều cần cải thiện, cần theo dõi…"
        />
      </label>
      <div className="mnc-foot">
        <button className="btn-primary" onClick={handleSave} disabled={saving || !dirty}>
          {saving ? 'Đang lưu…' : 'Lưu'}
        </button>
        {saved && !dirty && <span className="mnc-saved">✓ Đã lưu</span>}
        {error && <span className="error-text" style={{ margin: 0 }}>Lưu thất bại</span>}
      </div>
    </div>
  );
}
