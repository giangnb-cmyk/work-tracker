import { formatDateRange } from '../../lib/format';
import { lateSprintCount, tasksOfSprint, type PerfCtx, type SprintCompletion } from '../../lib/performance';
import { STATUS_LABEL, type Task } from '../../types';

interface SprintDetailDrawerProps {
  row: SprintCompletion;
  tasks: Task[];
  ctx: PerfCtx;
  sprintNameOf: (id: string | null) => string;
  onClose: () => void;
}

/** Chi tiết task của một sprint — gồm cả task đã bị chuyển sang sprint khác. */
export default function SprintDetailDrawer({
  row,
  tasks,
  ctx,
  sprintNameOf,
  onClose,
}: SprintDetailDrawerProps) {
  const sprintId = row.sprint.id;
  const rows = tasksOfSprint(tasks, sprintId, ctx)
    .map((task) => ({ task, moved: task.sprintId !== sprintId, late: lateSprintCount(task, ctx) }))
    // Task còn tồn/đã bị đẩy lên trước — đó là thứ cần nhìn.
    .sort((a, b) => b.late - a.late || Number(b.moved) - Number(a.moved));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>{row.sprint.name}</h2>
        <p className="perf-hint">
          {formatDateRange(row.sprint.startDate, row.sprint.endDate)} · {row.total} task · xong{' '}
          {row.done} ({row.percentDone}%)
          {row.isLateKnown && row.late > 0 ? ` · trễ ${row.late}` : ''}
        </p>

        <div className="table-container perf-drawer-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Người nhận</th>
                <th>Trạng thái</th>
                <th>Ở sprint này</th>
                <th>Trễ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ task, moved, late }) => (
                <tr key={task.id}>
                  <td>{task.title}</td>
                  <td className="muted">{task.assigneeName || 'Chưa giao'}</td>
                  <td>{STATUS_LABEL[task.status]}</td>
                  <td className="muted perf-when">
                    {moved ? `→ ${sprintNameOf(task.sprintId)}` : 'còn ở đây'}
                  </td>
                  <td className="mono">{late > 0 ? `${late} sprint` : '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="empty">Sprint này chưa có task nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="modal-actions">
          <button className="btn-sm" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
