import { useState } from 'react';
import Avatar from '../Avatar';
import { UNASSIGNED_UID } from '../../lib/performance';
import type { MemberOvertime, OvertimeSummary } from '../../lib/overtime';

interface OvertimeTableProps {
  summary: OvertimeSummary;
}

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

/** Danh sách việc OT của một người — mở ra ngay dưới dòng của họ. */
function OvertimeItems({ row }: { row: MemberOvertime }) {
  return (
    <tr className="ot-detail-row">
      <td colSpan={5}>
        <ul className="ot-items">
          {row.items.map((it) => (
            <li key={`${it.kind}-${it.id}`}>
              <span className="ot-item-kind" aria-hidden>{it.kind === 'bug' ? '🐞' : '📋'}</span>
              <span className="ot-item-title">{it.title}</span>
              <span className="ot-item-when mono muted">{it.dayLabel} · {shortDate(it.doneAtMs)}</span>
            </li>
          ))}
        </ul>
      </td>
    </tr>
  );
}

/**
 * Việc xong trong tuần (T2–T6) so với cuối tuần (T7/CN) — sprint chạy tới CN nhưng đội chỉ
 * làm tới T6, nên cột "OT" chính là phần làm thêm. Bấm một dòng để xem đó là task/bug nào.
 */
export default function OvertimeTable({ summary }: OvertimeTableProps) {
  const [openUid, setOpenUid] = useState<string | null>(null);

  return (
    <div className="glass section" style={{ padding: '1.5rem' }}>
      <h3>Làm thêm ngoài giờ (OT)</h3>
      <p className="perf-hint">
        Sprint tính tới Chủ nhật nhưng tuần làm việc chỉ T2–T6, nên việc đánh dấu xong vào
        T7/CN được tính là OT. Bấm vào dòng có OT để xem cụ thể task/bug nào.
      </p>

      <div className="ot-tiles">
        <div className="ot-tile">
          <span className="ot-tile-num mono">{summary.weekday}</span>
          <span className="ot-tile-lb muted">Xong trong tuần (T2–T6)</span>
        </div>
        <div className={`ot-tile${summary.weekend > 0 ? ' ot-tile-hot' : ''}`}>
          <span className="ot-tile-num mono">{summary.weekend}</span>
          <span className="ot-tile-lb muted">Xong cuối tuần — OT (T7/CN)</span>
        </div>
        <div className="ot-tile">
          <span className="ot-tile-num mono">{summary.percentWeekend}%</span>
          <span className="ot-tile-lb muted">Tỷ lệ OT</span>
        </div>
        <div className="ot-tile">
          <span className="ot-tile-num mono">{summary.unknown || '—'}</span>
          <span className="ot-tile-lb muted">Thiếu mốc xong — không xếp được</span>
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Thành viên</th>
              <th>Trong tuần</th>
              <th>OT (T7/CN)</th>
              <th>% OT</th>
              <th>Việc OT</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((r) => {
              const open = openUid === r.uid;
              return [
                <tr
                  key={r.uid}
                  className={`${r.weekend > 0 ? 'ot-row-hot' : ''}${open ? ' ot-row-open' : ''}`}
                  onClick={() => setOpenUid(open ? null : r.uid)}
                >
                  <td>
                    <span className="perf-who">
                      {r.uid === UNASSIGNED_UID ? (
                        <span className="perf-noavatar" aria-hidden />
                      ) : (
                        <Avatar name={r.name} photoURL={r.photoURL} size="sm" />
                      )}
                      <span className="perf-name">{r.name}</span>
                    </span>
                  </td>
                  <td className="mono">{r.weekday || '—'}</td>
                  <td className="mono ot-num">{r.weekend || '—'}</td>
                  <td className="mono">{r.weekday + r.weekend === 0 ? '—' : `${r.percentWeekend}%`}</td>
                  <td>
                    {r.weekend > 0 ? (
                      <button type="button" className="ot-expand" aria-expanded={open}>
                        {open ? 'Ẩn' : `Xem ${r.weekend} việc`}
                      </button>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>,
                open && r.weekend > 0 ? <OvertimeItems key={`${r.uid}-items`} row={r} /> : null,
              ];
            })}
            {summary.rows.length === 0 && (
              <tr><td colSpan={5} className="empty">Chưa có việc nào hoàn thành trong khoảng này.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
