import { NotionIcon, PuzzleIcon } from '../icons';
import { useSprintContext } from '../../contexts/SprintContext';
import type { Task } from '../../types';

interface Props {
  task: Task;
  /**
   * Project của task có liên kết Notion không. Không truyền = suy từ project đang chọn
   * (SprintContext) — chỉ view hiển thị project KHÁC project đang chọn (vd Projects
   * drill-down) mới cần truyền tường minh.
   */
  notionEnabled?: boolean;
}

/**
 * Hai cờ trạng thái ngoài lề của một task, để khỏi mở ra mới biết:
 * - Đã GẮN FEATURE chưa (mảnh ghép) — sáng nếu có featureId.
 * - Đã TẠO trên NOTION chưa (logo Notion) — sáng + bấm mở trang nếu có notionPageId.
 *   Project tắt liên kết Notion (notionProjectId rỗng) thì ẨN HẲN cờ này — không icon,
 *   không link mở trang.
 *
 * Dùng chung cho dòng (TaskListRow) lẫn thẻ (TaskRow) để hai nơi luôn giống nhau.
 */
export default function TaskFlags({ task, notionEnabled }: Props) {
  const { selectedProject } = useSprintContext();
  const showNotion = notionEnabled ?? !!selectedProject?.notionProjectId;

  return (
    <span className="task-flags">
      <span
        className={`task-flag${task.featureId ? ' on' : ' off'}`}
        title={task.featureId ? 'Đã gắn feature' : 'Chưa gắn feature'}
        aria-label={task.featureId ? 'Đã gắn feature' : 'Chưa gắn feature'}
      >
        <PuzzleIcon size={15} />
      </span>

      {showNotion && (task.notionPageId ? (
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
      ))}
    </span>
  );
}
