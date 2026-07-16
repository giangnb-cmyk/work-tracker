import { useMemo, useState } from 'react';
import { useSprintContext } from '../contexts/SprintContext';
import { useVisits } from '../hooks/useVisits';
import { visitStats } from '../lib/visitStats';
import { fmtDay, presetLabel, presetRange, startOfYear, type DateRange } from '../lib/dateRange';
import { timeAgo } from '../lib/format';
import { Timestamp } from '../lib/time';
import Avatar from './Avatar';
import DateRangePicker from './DateRangePicker';
import MetricCaveat from './performance/MetricCaveat';

const CAVEATS = [
  '1 lượt = 1 phiên mở web (mở tab mới). Bấm F5 trong cùng tab KHÔNG tính thêm lượt, nên số này gần với "số lần vào làm việc" hơn là số lần tải trang.',
  'Chỉ có dữ liệu TỪ KHI bật tính năng (migration 0023) — những lần truy cập trước đó không ai lưu nên vĩnh viễn không hồi tố được.',
  'Mở app trên 2 trình duyệt / 2 máy cùng lúc = 2 lượt. Người để tab mở cả ngày không đóng chỉ tính 1 lượt, dù dùng liên tục — vì vậy cột "Số ngày vào" đáng tin hơn cột "Lượt" khi so người với người.',
  'Người bị chặn ở cửa allowlist KHÔNG được tính là một lượt.',
  'Mốc thời gian đọc theo giờ máy đang xem. Tuần bắt đầu từ THỨ 2.',
];

/** Trang thống kê lượt truy cập web theo khoảng thời gian tuỳ chọn (chỉ admin — chặn ở Sidebar + Layout). */
export default function Visits() {
  const { members, membersLoading } = useSprintContext();
  // Mặc định "7 ngày qua" — cùng preset GA hay mở. Mốc "bây giờ" chốt lúc mount để mọi
  // dòng trong một lần render dùng chung; đổi khoảng thì picker tự lấy Date.now() mới.
  const [range, setRange] = useState<DateRange>(() => presetRange('d7', Date.now()));

  // Cửa sổ NẠP dữ liệu: rộng tối thiểu từ đầu năm để đổi qua lại các preset trong năm
  // không phải gọi mạng lại; chỉ nới thêm khi người dùng chọn khoảng cũ hơn.
  const sinceMs = useMemo(
    () => Math.min(startOfYear(range.toMs), range.fromMs),
    [range.fromMs, range.toMs],
  );
  const { visits, loading } = useVisits(sinceMs);

  const summary = useMemo(
    () => visitStats({ visits, members, fromMs: range.fromMs, toMs: range.toMs }),
    [visits, members, range.fromMs, range.toMs],
  );

  const rangeLabel = range.presetId ? presetLabel(range.presetId).toLowerCase() : 'khoảng đã chọn';

  if (membersLoading || loading) {
    return <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>;
  }

  return (
    <div className="fade-in">
      <div className="view-header row between">
        <div>
          <h1>👣 Truy cập</h1>
          <p>Chỉ admin xem được. Ai vào web bao nhiêu lần, theo khoảng thời gian tuỳ chọn.</p>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      <div className="ot-tiles">
        <div className="ot-tile">
          <span className="ot-tile-num mono">{summary.total}</span>
          <span className="ot-tile-lb muted">Tổng lượt · {rangeLabel}</span>
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
            {fmtDay(range.fromMs)} – {fmtDay(range.toMs)}
          </span>
          <span className="ot-tile-lb muted">Khoảng thời gian</span>
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
          Không có lượt nào trong khoảng này. Dữ liệu chỉ bắt đầu từ khi tính năng lên
          production — quá khứ không hồi tố được.
        </div>
      )}

      <MetricCaveat items={CAVEATS} />
    </div>
  );
}
