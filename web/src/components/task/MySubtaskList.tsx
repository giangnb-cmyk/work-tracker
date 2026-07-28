import { useEffect, useMemo, useState } from 'react';
import { toggleMySubtask } from '../../lib/taskWrites';
import { reportError } from '../../lib/errorBus';
import type { MySubtask } from '../../hooks/useMySubtasks';
import type { Subtask, Task } from '../../types';

interface Props {
  items: MySubtask[];
  /** Tên sprint của task cha — subtask không có sprint riêng, nó theo task. */
  sprintName: (id: string | null) => string;
  onOpenTask: (task: Task) => void;
}

/**
 * Subtask được giao cho người đang đăng nhập, gom theo TASK CHA.
 *
 * Đứng riêng thay vì nhét vào từng dòng task: task cha có thể là của người khác (giao
 * subtask cho nhau là chuyện thường), nên nó không nằm trong danh sách "task của tôi" ở
 * trên — nhét vào đó thì mất hẳn.
 */
export default function MySubtaskList({ items, sprintName, onOpenTask }: Props) {
  /**
   * Trạng thái tick TẠM cho tới khi dữ liệu live đuổi kịp. Không có nó thì ô tick phải chờ
   * ghi → realtime → refetch (~nửa giây) mới nhúc nhích, bấm phát nào cũng thấy đơ.
   */
  const [pending, setPending] = useState<Record<string, boolean>>({});

  // Server đã khớp với cái mình đoán → bỏ override, trả quyền hiển thị về dữ liệu thật.
  useEffect(() => {
    setPending((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const { subtask } of items) {
        if (subtask.id in next && next[subtask.id] === subtask.done) {
          delete next[subtask.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [items]);

  // Gom theo task, giữ thứ tự xuất hiện (items đã sắp theo `order` của task).
  const groups = useMemo(() => {
    const map = new Map<string, { task: Task; subs: MySubtask[] }>();
    for (const it of items) {
      const g = map.get(it.task.id);
      if (g) g.subs.push(it);
      else map.set(it.task.id, { task: it.task, subs: [it] });
    }
    return [...map.values()];
  }, [items]);

  const isDone = (s: Subtask) => pending[s.id] ?? s.done;

  /** Tick/bỏ tick subtask của chính mình — qua RPC vì task cha có thể của người khác. */
  async function toggle(task: Task, subtask: Subtask) {
    const next = !isDone(subtask);
    setPending((p) => ({ ...p, [subtask.id]: next }));
    const rollback = () =>
      setPending((p) => {
        const copy = { ...p };
        delete copy[subtask.id];
        return copy;
      });
    try {
      const ok = await toggleMySubtask(task.id, subtask.id, next);
      if (!ok) {
        rollback();
        reportError(
          'Subtask',
          new Error('Máy chủ từ chối cập nhật subtask'),
          'Subtask này không còn được giao cho bạn — tải lại trang để xem trạng thái mới nhất.',
        );
      }
    } catch (err) {
      rollback();
      reportError('Subtask', err, 'Không tick được subtask. Kiểm tra kết nối rồi thử lại.');
    }
  }

  return (
    <div className="msub-list">
      {groups.map(({ task, subs }) => (
        <div key={task.id} className="msub-group glass">
          <button type="button" className="msub-parent" onClick={() => onOpenTask(task)}>
            <span className="msub-parent-title">{task.title}</span>
            <span className="msub-parent-meta muted">
              {sprintName(task.sprintId)}
              {task.assigneeName ? ` · ${task.assigneeName}` : ''}
            </span>
          </button>
          <ul className="msub-items">
            {subs.map(({ subtask }) => (
              <li key={subtask.id} className={`msub-item${isDone(subtask) ? ' done' : ''}`}>
                <label className="st-check">
                  <input type="checkbox" checked={isDone(subtask)} onChange={() => void toggle(task, subtask)} />
                  <span className="st-box" aria-hidden>
                    <svg viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6.5L5 9l4.5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="st-title">{subtask.title}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
