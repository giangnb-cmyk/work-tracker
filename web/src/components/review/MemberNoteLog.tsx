import { useEffect, useMemo, useState } from 'react';
import { fetchMemberNotes } from '../../lib/memberReviewWrites';
import { formatDate } from '../../lib/format';
import { NOTE_PERIODS, noteBuckets, filterNotesByBucket, type NotePeriod } from '../../lib/notePeriods';
import { NOTE_RATINGS, type MemberSprintNote } from '../../types';

/**
 * Nhật ký ghi chú đánh giá của MỘT người qua các sprint (mới nhất trước), lọc theo Sprint / Tháng
 * / Quý. Chỉ ĐỌC — nạp một lần khi mở popup; đặt dưới form trong `MemberNoteModal`. Không mở
 * channel realtime (imperative fetch), giống tab "Ghi chú" ở MemberModal.
 */
export default function MemberNoteLog({ memberId }: { memberId: string }) {
  const [notes, setNotes] = useState<MemberSprintNote[]>([]);
  const [period, setPeriod] = useState<NotePeriod>('sprint');
  const [bucketKey, setBucketKey] = useState('');

  useEffect(() => {
    let alive = true;
    fetchMemberNotes(memberId)
      .then((n) => { if (alive) setNotes(n); })
      .catch((err) => console.error('Tải nhật ký ghi chú thất bại', err));
    return () => { alive = false; };
  }, [memberId]);

  const buckets = useMemo(() => noteBuckets(notes, period), [notes, period]);
  const shown = useMemo(() => filterNotesByBucket(notes, period, bucketKey), [notes, period, bucketKey]);

  // Đổi chiều lọc (Sprint/Tháng/Quý) thì key kỳ cũ vô nghĩa → quay về "Tất cả".
  function changePeriod(p: NotePeriod) {
    setPeriod(p);
    setBucketKey('');
  }

  if (notes.length === 0) return null;

  return (
    <div className="note-log">
      <div className="note-log-head">
        <span className="field-label">Nhật ký ghi chú</span>
        <div className="note-log-filter">
          <div className="seg-toggle seg-sm" role="group" aria-label="Lọc theo kỳ">
            {NOTE_PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`seg${period === p.id ? ' on' : ''}`}
                onClick={() => changePeriod(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <select
            className="select note-log-select"
            value={bucketKey}
            onChange={(e) => setBucketKey(e.target.value)}
            aria-label="Chọn kỳ"
          >
            <option value="">Tất cả</option>
            {buckets.map((b) => (
              <option key={b.key} value={b.key}>{b.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mm-notes note-log-list">
        {shown.map((n) => {
          const r = NOTE_RATINGS.find((x) => x.value === n.rating);
          return (
            <div key={n.id} className="mm-note-row">
              <div className="mm-note-head">
                <strong>{n.sprintName || 'Sprint'}</strong>
                <span className="muted mono note-log-date">{formatDate(n.sprintStart ?? n.createdAt)}</span>
              </div>
              {r && <div className="note-log-rating muted">{r.icon} {r.label}</div>}
              {n.overview && <p><span className="muted">Tổng quan:</span> {n.overview}</p>}
              {n.highlights && <p><span className="muted">Nổi bật:</span> {n.highlights}</p>}
              {n.concerns && <p><span className="muted">Lưu ý:</span> {n.concerns}</p>}
            </div>
          );
        })}
        {shown.length === 0 && (
          <p className="muted" style={{ fontSize: '0.85rem' }}>Không có ghi chú trong kỳ này.</p>
        )}
      </div>
    </div>
  );
}
