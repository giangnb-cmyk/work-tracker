import { formatDateRange } from '../../lib/format';
import type { SprintPhase } from '../../lib/sprintRange';
import type { SprintCompletion } from '../../lib/performance';

const PHASE_LABEL: Record<SprintPhase, string> = {
  finished: 'Đã kết thúc',
  running: 'Đang chạy',
  upcoming: 'Sắp tới',
  unknown: 'Không rõ',
};
const PHASE_CLASS: Record<SprintPhase, string> = {
  finished: 'status-completed',
  running: 'status-active',
  upcoming: 'status-planning',
  unknown: 'status-planning',
};

interface SprintCompletionTableProps {
  rows: SprintCompletion[];
  onOpen: (row: SprintCompletion) => void;
}

/** Danh sách sprint trong khoảng; bấm một dòng để xem chi tiết task của sprint đó. */
export default function SprintCompletionTable({ rows, onOpen }: SprintCompletionTableProps) {
  const finished = rows.filter((r) => r.phase === 'finished');
  const clean = finished.filter((r) => r.late === 0).length;

  return (
    <div className="glass section" style={{ padding: '1.5rem' }}>
      <h3>Theo sprint</h3>
      <p className="perf-hint">
        {finished.length === 0
          ? 'Chưa có sprint nào kết thúc trong khoảng này.'
          : `${clean}/${finished.length} sprint đã kết thúc mà làm xong hết task.`}{' '}
        Bấm một dòng để xem chi tiết task.
      </p>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sprint</th>
              <th>Thời gian</th>
              <th>Trạng thái</th>
              <th>Xong / Tổng</th>
              <th>Đã chuyển đi</th>
              <th>Trễ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sprint.id} className="row-click" onClick={() => onOpen(r)}>
                <td>{r.sprint.name}</td>
                <td className="muted mono perf-when">
                  {formatDateRange(r.sprint.startDate, r.sprint.endDate)}
                </td>
                <td><span className={`badge ${PHASE_CLASS[r.phase]}`}>{PHASE_LABEL[r.phase]}</span></td>
                <td className="mono">
                  {r.done}
                  <span className="perf-sub">/ {r.total}</span>
                  {r.total > 0 && <span className="perf-sub">{r.percentDone}%</span>}
                </td>
                <td className="mono">{r.carriedAway || '—'}</td>
                {/* Sprint chưa kết thúc thì "trễ" chưa có nghĩa — hiện "—" chứ không hiện 0. */}
                <td className="mono">{r.isLateKnown ? r.late || '—' : '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="empty">Chọn khoảng sprint để xem.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
