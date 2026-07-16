import { useMemo, useState } from 'react';
import { useSprintContext } from '../contexts/SprintContext';
import { useVisits } from '../hooks/useVisits';
import { periodStart, visitStats, PERIOD_LABEL, type Period } from '../lib/visitStats';
import { formatDate, timeAgo } from '../lib/format';
import { Timestamp } from '../lib/time';
import Avatar from './Avatar';
import MetricCaveat from './performance/MetricCaveat';

const PERIODS: Period[] = ['week', 'month', 'year'];

const CAVEATS = [
  '1 lượt = 1 phiên mở web (mở tab mới). Bấm F5 trong cùng tab KHÔNG tính thêm lượt, nên số này gần với "số lần vào làm việc" hơn là số lần tải trang.',
  'Chỉ có dữ liệu TỪ KHI bật tính năng (migration 0023) — những lần truy cập trước đó không ai lưu nên vĩnh viễn không hồi tố được.',
  'Mở app trên 2 trình duyệt / 2 máy cùng lúc = 2 lượt. Người để tab mở cả ngày không đóng chỉ tính 1 lượt, dù dùng liên tục — vì vậy cột "Số ngày vào" đáng tin hơn cột "Lượt" khi so người với người.',
  'Người bị chặn ở cửa allowlist KHÔNG được tính là một lượt.',
  'Mốc thời gian đọc theo giờ máy đang xem. Tuần bắt đầu từ THỨ 2.',
];

/** Trang thống kê lượt truy cập web theo tuần/tháng/năm (chỉ admin — chặn ở Sidebar + Layout). */
export default function Visits() {
  const { members, membersLoading } = useSprintContext();
  const [period, setPeriod] = useState<Period>('week');

  // Một mốc duy nhất cho cả lần render — mỗi chỗ tự gọi Date.now() là các dòng có thể rơi
  // vào hai bên nửa đêm.
  const nowMs = useMemo(() => Date.now(), []);
  // Luôn nạp từ đầu NĂM: đổi qua lại tuần/tháng/năm không phải gọi mạng lại.
  const sinceMs = useMemo(() => periodStart(nowMs, 'year').getTime(), [nowMs]);
  const { visits, loading } = useVisits(sinceMs);

  const summary = useMemo(
    () => visitStats({ visits, members, nowMs, period }),
    [visits, members, nowMs, period],
  );

  if (membersLoading || loading) {
    return <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>;
  }

  return (
    <div className="fade-in">
      <div className="view-header row between">
        <div>
          <h1>👣 Truy cập</h1>
          <p>Chỉ admin xem được. Ai vào web bao nhiêu lần, theo tuần / tháng / năm.</p>
        </div>
        <div className="seg-toggle" role="group" aria-label="Kỳ thống kê">
          {PERIODS.map((p) => (
            <button key={p} className={`seg${period === p ? ' on' : ''}`} onClick={() => setPeriod(p)}>
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="ot-tiles">
        <div className="ot-tile">
          <span className="ot-tile-num mono">{summary.total}</span>
          <span className="ot-tile-lb muted">Tổng lượt · {PERIOD_LABEL[period].toLowerCase()}</span>
        </div>
        <div className="ot-tile">
          <span className="ot-tile-num mono">{summary.activeUsers}/{members.length}</span>
          <span className="ot-tile-lb muted">Người có vào</span>
        </div>
        <div className={`ot-tile${summary.idleUsers > 0 ? ' ot-tile-hot' : ''}`}>
          <span className="ot-tile-num mono">{summary.idleUsers || '—'}</span>
          <span className="ot-tile-lb muted">Không vào lần nào</span>
        </div>
        <div className="ot-tile">
          <span className="ot-tile-num mono" style={{ fontSize: '1rem' }}>
            {formatDate(Timestamp.fromDate(new Date(summary.fromMs)))}
          </span>
          <span className="ot-tile-lb muted">Tính từ ngày</span>
        </div>
      </div>

      <div className="glass section" style={{ padding: '1.5rem' }}>
        <h3>Chi tiết theo người</h3>
        <p className="perf-hint">
          “Số ngày vào” đáng tin hơn “Lượt” khi so người với người: người để tab mở cả ngày
          chỉ tính 1 lượt dù dùng liên tục.
        </p>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Thành viên</th>
                <th>Lượt</th>
                <th>Số ngày vào</th>
                <th>Lần gần nhất</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((r) => (
                <tr key={r.uid} className={r.visits === 0 ? 'row-idle' : undefined}>
                  <td>
                    <span className="perf-who">
                      <Avatar name={r.name} photoURL={r.photoURL} size="sm" />
                      <span className="perf-name">{r.name}</span>
                    </span>
                  </td>
                  <td className="mono">{r.visits || '—'}</td>
                  <td className="mono">{r.activeDays || '—'}</td>
                  <td className="muted" style={{ fontSize: '0.8rem' }}>
                    {r.lastAtMs ? timeAgo(Timestamp.fromDate(new Date(r.lastAtMs))) : 'chưa vào'}
                  </td>
                </tr>
              ))}
              {summary.rows.length === 0 && (
                <tr><td colSpan={4} className="empty">Chưa có thành viên nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {summary.total === 0 && (
        <div className="callout-inline" style={{ marginTop: '1rem' }}>
          Chưa ghi được lượt nào. Dữ liệu chỉ bắt đầu từ khi tính năng này lên production —
          quá khứ không hồi tố được.
        </div>
      )}

      <MetricCaveat items={CAVEATS} />
    </div>
  );
}
