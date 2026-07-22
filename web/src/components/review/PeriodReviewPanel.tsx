import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSprintContext } from '../../contexts/SprintContext';
import { usePeriodReviews } from '../../hooks/usePeriodReviews';
import { enqueueMemberReview, fetchMemberReviewRequest } from '../../lib/memberReviewWrites';
import { periodLabel, periodRange } from '../../lib/period';
import { formatDate } from '../../lib/format';
import Avatar from '../Avatar';
import type { MemberPeriodReview, PeriodKind, TeamMember } from '../../types';

/** Bot quét ~60s (bug_sync_poll_seconds) — chờ đủ lâu rồi mới bỏ cuộc (giống MemberDmTest). */
const POLL_MS = 3000;
const MAX_POLLS = 40;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const QUARTERS = [1, 2, 3, 4];

/** Một dòng: hiện review sẵn có + nút Phân tích/Làm mới (enqueue rồi poll status như MemberDmTest). */
function PeriodMemberRow({
  member, kind, start, end, review, requestedBy,
}: {
  member: TeamMember;
  kind: PeriodKind;
  start: string;
  end: string;
  review?: MemberPeriodReview;
  requestedBy: string;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  async function run(force: boolean) {
    setBusy(true);
    setMsg('Đang xếp hàng…');
    try {
      const id = await enqueueMemberReview(member.uid, kind, start, end, force, requestedBy);
      setMsg('Đã xếp hàng — chờ bot xử lý (bot quét mỗi ~1 phút)…');
      for (let i = 0; i < MAX_POLLS; i++) {
        await sleep(POLL_MS);
        if (!alive.current) return;
        const r = await fetchMemberReviewRequest(id);
        if (r.status !== 'pending') {
          // done: kết quả tự hiện qua realtime (usePeriodReviews) → xoá thông báo.
          setMsg(r.status === 'done' ? null : `⚠️ ${r.result}`);
          setBusy(false);
          return;
        }
      }
      setMsg('⏳ Bot chưa phản hồi — kiểm tra bot có đang chạy và "member_review.enabled" trong bot/settings.json.');
    } catch (err) {
      console.error('Phân tích AI thất bại', err);
      setMsg('Gửi yêu cầu thất bại (cần quyền admin; đã áp migration 0060 chưa?).');
    }
    if (alive.current) setBusy(false);
  }

  return (
    <div className="glass period-review">
      <div className="pr-head">
        <Avatar name={member.displayName} photoURL={member.photoURL} size="sm" />
        <span className="mnc-head-name">{member.displayName}</span>
        <button className="btn-sm" onClick={() => run(Boolean(review))} disabled={busy}>
          {busy ? 'Đang phân tích…' : review ? '↻ Làm mới' : '✨ Phân tích AI'}
        </button>
      </div>
      {review?.status === 'empty' && <div className="muted pr-status">Chưa có ghi chú nào trong kỳ.</div>}
      {review?.status === 'done' && (
        <>
          <div className="pr-summary">{review.summary}</div>
          <div className="pr-meta">
            {review.sourceNoteCount} ghi chú · {review.model || 'AI'}
            {review.generatedAt ? ` · ${formatDate(review.generatedAt)}` : ''}
          </div>
        </>
      )}
      {msg && <div className="callout-inline pr-status">{msg}</div>}
    </div>
  );
}

/** Chọn kỳ (tháng/quý) → mỗi người một dòng: bấm "Phân tích AI" để bot tổng hợp từ ghi chú sprint. */
export default function PeriodReviewPanel() {
  const { isAdmin, profile } = useAuth();
  const { members } = useSprintContext();
  const now = new Date();
  const [kind, setKind] = useState<PeriodKind>('month');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);

  const index = kind === 'month' ? month : quarter;
  const { start, end } = periodRange(kind, year, index);
  const { byMember } = usePeriodReviews(kind, start, isAdmin);
  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  return (
    <div className="glass section" style={{ padding: '1.25rem', marginTop: '1rem' }}>
      <div className="row" style={{ gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="seg-toggle" role="group" aria-label="Loại kỳ">
          <button className={`seg${kind === 'month' ? ' on' : ''}`} onClick={() => setKind('month')}>Tháng</button>
          <button className={`seg${kind === 'quarter' ? ' on' : ''}`} onClick={() => setKind('quarter')}>Quý</button>
        </div>
        <label className="field" style={{ margin: 0, minWidth: 120 }}>
          <span>{kind === 'month' ? 'Tháng' : 'Quý'}</span>
          {kind === 'month' ? (
            <select className="select" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m) => <option key={m} value={m}>Tháng {m}</option>)}
            </select>
          ) : (
            <select className="select" value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
              {QUARTERS.map((q) => <option key={q} value={q}>Quý {q}</option>)}
            </select>
          )}
        </label>
        <label className="field" style={{ margin: 0, minWidth: 100 }}>
          <span>Năm</span>
          <select className="select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>

      <p className="muted" style={{ fontSize: '0.82rem', margin: '0.85rem 0 0.25rem' }}>
        AI đọc các ghi chú sprint <strong>giao</strong> với {periodLabel(kind, start)} và viết bản đánh giá tổng hợp cho từng người.
      </p>

      {members.length === 0 ? (
        <p className="muted">Chưa có thành viên nào.</p>
      ) : (
        <div className="review-grid">
          {members.map((m) => (
            <PeriodMemberRow
              key={m.uid}
              member={m}
              kind={kind}
              start={start}
              end={end}
              review={byMember.get(m.uid)}
              requestedBy={profile?.uid ?? ''}
            />
          ))}
        </div>
      )}
    </div>
  );
}
