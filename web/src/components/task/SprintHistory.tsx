import { useSprintContext } from '../../contexts/SprintContext';
import { useTaskSprints } from '../../hooks/useTaskSprints';
import { formatDate } from '../../lib/format';
import type { Task } from '../../types';

interface SprintHistoryProps {
  task: Task;
  /** Sprint đang chọn trong modal (state, có thể mới hơn `task.sprintId` do autosave). */
  currentSprintId: string | null;
}

/**
 * Lịch sử sprint của task (bảng `task_sprints`): từng ở sprint nào, vào lúc nào, cộng
 * tổng tuổi task — nhìn phát là biết task có bị kẹt/lết qua nhiều sprint không.
 *
 * Tổng ngày tính từ lúc TẠO task (kể cả thời gian nằm backlog — chờ ở backlog cũng là
 * tuổi) tới ngày hoàn thành (dueDate của task done = ngày xong thật) hoặc tới hôm nay.
 * Chỉ có dữ liệu từ khi áp migration 0015 — task chuyển sprint trước đó chỉ còn sprint cuối.
 */
export default function SprintHistory({ task, currentSprintId }: SprintHistoryProps) {
  const { sprints } = useSprintContext();
  const { entries } = useTaskSprints(task.id);
  if (entries.length === 0) return null; // task thuần backlog — chưa có lịch sử để kể

  const nameOf = (id: string) => sprints.find((s) => s.id === id)?.name ?? '(sprint đã xoá)';
  const startMs = task.createdAt?.toMillis() ?? entries[0].addedAt?.toMillis() ?? Date.now();
  const endMs = (task.status === 'done' ? task.dueDate?.toMillis() : null) ?? Date.now();
  const totalDays = Math.max(1, Math.round((endMs - startMs) / 86_400_000));
  // Bị đẩy qua ≥2 sprint, hoặc chưa xong mà lết quá 2 tuần → tô vàng cho đập vào mắt.
  const slow = entries.length >= 2 || (task.status !== 'done' && totalDays > 14);

  return (
    <section className="tm-section">
      <h4 className="tm-h">🔁 Lịch sử sprint</h4>
      <div className="tm-sprints">
        {entries.map((e, i) => (
          <span key={e.sprintId} className="ts-step">
            {i > 0 && <span className="ts-arrow" aria-hidden>→</span>}
            <span
              className={`ts-chip${e.sprintId === currentSprintId ? ' now' : ''}`}
              title={`Vào sprint này ngày ${formatDate(e.addedAt)}`}
            >
              {nameOf(e.sprintId)}
              <small>{formatDate(e.addedAt)}</small>
            </span>
          </span>
        ))}
      </div>
      <p className={`ts-summary${slow ? ' warn' : ''}`}>
        Qua <strong className="mono">{entries.length}</strong> sprint · tổng{' '}
        <strong className="mono">{totalDays}</strong> ngày{task.status === 'done' ? ' (đã xong)' : ''}
      </p>
    </section>
  );
}
