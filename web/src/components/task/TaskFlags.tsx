import { NotionIcon, PuzzleIcon } from '../icons';
import type { Task } from '../../types';

interface Props {
  task: Task;
}

/**
 * Hai cờ trạng thái ngoài lề của một task, để khỏi mở ra mới biết:
 * - Đã GẮN FEATURE chưa (mảnh ghép) — sáng nếu có featureId.
 * - Đã TẠO trên NOTION chưa (logo Notion) — sáng + bấm mở trang nếu có notionPageId.
 *
 * Dùng chung cho dòng (TaskListRow) lẫn thẻ (TaskRow) để hai nơi luôn giống nhau.
 */
export default function TaskFlags({ task }: Props) {
  return (
    <span className="task-flags">
      <span
        className={`task-flag${task.featureId ? ' on' : ' off'}`}
        title={task.featureId ? 'Đã gắn feature' : 'Chưa gắn feature'}
        aria-label={task.featureId ? 'Đã gắn feature' : 'Chưa gắn feature'}
      >
        <PuzzleIcon size={15} />
      </span>

      {task.notionPageId ? (
        <a
          className="task-flag on notion"
          href={task.notionUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Đã tạo trên Notion — bấm để mở"
          aria-label="Đã tạo trên Notion"
        >
          <NotionIcon size={15} />
        </a>
      ) : (
        <span
          className="task-flag off notion"
          title="Chưa tạo trên Notion"
          aria-label="Chưa tạo trên Notion"
        >
          <NotionIcon size={15} />
        </span>
      )}
    </span>
  );
}
