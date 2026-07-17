import { formatDate } from '../../lib/format';
import { STATUS_LABEL, type Task, type TaskStatus } from '../../types';
import type { FeatureRow } from '../../lib/timelineRows';

const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: '#94a3b8',
  in_progress: '#38bdf8',
  review: '#c084fc',
  done: '#22c55e',
};

interface Props {
  row: FeatureRow;
  onClose: () => void;
  /** Mở chi tiết task. Modal tự đóng trước — hai lớp popup chồng nhau đọc không ra. */
  onJump: (task: Task) => void;
}

/** Popup danh sách task của một feature (bấm từ Timeline). Mỗi dòng có nút mở chi tiết. */
export default function FeatureTasksModal({ row, onClose, onJump }: Props) {
  const f = row.feature;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ftm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ftm-head">
          <h2>{f ? `${f.icon} ${f.name}` : '📦 Task chưa gắn feature'}</h2>
          <span className="muted mono ftm-count">{row.done}/{row.total} xong</span>
        </div>

        {row.bars.length === 0 ? (
          <div className="glass empty">Feature này chưa có task.</div>
        ) : (
          <ul className="ftm-list">
            {row.bars.map((b) => (
              <li key={b.task.id} className="ftm-item">
                <span className="tl-dot" style={{ background: STATUS_COLOR[b.task.status] }} />
                <span className="ftm-main">
                  <span className="ftm-title">{b.task.title}</span>
                  <span className="muted ftm-sub">
                    {STATUS_LABEL[b.task.status]}
                    {' · '}{b.task.assigneeName || 'Chưa giao'}
                    {b.hasDates ? ` · hạn ${formatDate(b.task.dueDate)}` : ' · chưa có hạn'}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn-sm ftm-jump"
                  onClick={() => onJump(b.task)}
                  title="Mở chi tiết task"
                >
                  Jump ↗
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <button className="btn-sm" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
