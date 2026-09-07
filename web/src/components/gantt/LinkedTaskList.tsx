import { useMemo } from 'react';
import { formatDate } from '../../lib/format';
import { STATUS_LABEL, type Task } from '../../types';

interface Props {
  /** Task trong phạm vi chart (đã lọc theo feature / danh sách chọn). */
  scope: Task[];
  /** Nhãn nguồn, vd "tự động từ feature Shop". */
  label: string;
  onOpenTask?: (task: Task) => void;
}

/**
 * Thay cho nhật ký tay ở chart LINK: liệt kê task trong phạm vi, task đã xong lên đầu kèm
 * ngày xong (chính là điểm trên đường tiến độ thật). Muốn đổi tiến độ thì đổi trạng thái
 * task — không có ô nhập ở đây, tránh hai nguồn sự thật.
 */
export default function LinkedTaskList({ scope, label, onOpenTask }: Props) {
  const rows = useMemo(
    () =>
      [...scope].sort((a, b) => {
        const ad = a.status === 'done' ? 0 : 1;
        const bd = b.status === 'done' ? 0 : 1;
        if (ad !== bd) return ad - bd;
        const at = a.dueDate?.toDate().getTime() ?? 0;
        const bt = b.dueDate?.toDate().getTime() ?? 0;
        return ad === 0 ? bt - at : at - bt;
      }),
    [scope],
  );
  const done = scope.filter((t) => t.status === 'done').length;

  return (
    <div className="plog">
      <div className="plog-head">
        <strong>Tiến độ {label}</strong>
        <span className="gantt-meta">{done}/{scope.length} task đã xong</span>
      </div>
      <p className="plog-hint">Đổi trạng thái task là đường tiến độ đổi theo. Ngày xong lấy từ lúc tick hoàn thành.</p>
      {rows.length === 0 ? (
        <div className="plog-empty">Phạm vi chưa có task nào. Sửa chart để chọn feature hoặc task khác.</div>
      ) : (
        <ul className="plog-list">
          {rows.map((t) => (
            <li key={t.id} className={`plog-item ltask${t.status === 'done' ? ' done' : ''}`}>
              <span className="mono">{t.status === 'done' && t.dueDate ? formatDate(t.dueDate).slice(0, 5) : ''}</span>
              <button type="button" className="ltask-title" onClick={() => onOpenTask?.(t)} title={t.title}>
                {t.title}
              </button>
              <span className="gantt-meta">{t.status === 'done' ? 'Xong' : STATUS_LABEL[t.status]}</span>
              <span />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
