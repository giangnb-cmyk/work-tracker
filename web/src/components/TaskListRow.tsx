import { useCallback, useRef, useState } from 'react';
import MemberAvatar from './MemberAvatar';
import { daysUntil } from '../lib/format';
import { taskProgress } from '../lib/sprint';
import { PRIO_COLOR } from '../lib/taskColors';
import { MoreVerticalIcon } from './icons';
import TaskFlags from './task/TaskFlags';
import { useClickOutside } from '../hooks/useClickOutside';
import type { MemberRoleInfo } from '../lib/memberRole';
import { PRIORITY_LABEL, STATUS_LABEL, type Task, type TaskStatus } from '../types';

interface TaskListRowProps {
  task: Task;
  /** Chuyên môn người nhận (role động trước, enum cũ sau — xem lib/memberRole). */
  assigneeRole?: MemberRoleInfo;
  canChangeStatus: boolean;
  onOpen: (task: Task) => void;
  onQuickStatus: (task: Task, status: TaskStatus) => void;
  onMoveSprint?: (task: Task) => void;
  /** Có truyền thì task CHƯA GIAO hiện nút "Nhận task" thay chip người nhận — ai rảnh tự pick. */
  onClaim?: (task: Task) => void;
  /** Ẩn cột người nhận ở màn chỉ có task của chính mình. */
  showAssignee?: boolean;
  /** Project có liên kết Notion không — không truyền thì TaskFlags suy từ project đang chọn. */
  notionEnabled?: boolean;
}

const UNDONE_STATUS: TaskStatus = 'in_progress';

function fmtDay(task: Task): string {
  const d = task.dueDate?.toDate();
  return d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—';
}

/**
 * Task ở dạng MỘT DÒNG — bản gọn của TaskRow (card), dùng cho Bảng Sprint và tuỳ chọn
 * "List" ở Task của tôi. Cùng dữ liệu, cùng thao tác, chỉ khác mật độ.
 */
export default function TaskListRow({
  task,
  assigneeRole,
  canChangeStatus,
  onOpen,
  onQuickStatus,
  onMoveSprint,
  onClaim,
  showAssignee = true,
  notionEnabled,
}: TaskListRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useClickOutside(menuRef, closeMenu, menuOpen);
  const done = task.status === 'done';
  const progress = taskProgress(task);
  const subs = task.subtasks ?? [];
  const subDone = subs.filter((s) => s.done).length;
  const overdue = !done && task.dueDate && (daysUntil(task.dueDate) ?? 1) < 0;

  function toggleDone() {
    setMenuOpen(false);
    if (!canChangeStatus) return;
    if (done) {
      if (window.confirm('Bạn có muốn huỷ hoàn thành task này không?')) onQuickStatus(task, UNDONE_STATUS);
    } else {
      onQuickStatus(task, 'done');
    }
  }

  return (
    <div className="trow-group">
      <div className={`trow${done ? ' done' : ''}`} onClick={() => onOpen(task)}>
        <button
          className="trow-check"
          disabled={!canChangeStatus}
          onClick={(e) => { e.stopPropagation(); toggleDone(); }}
          title={done ? 'Bỏ hoàn thành' : 'Đánh dấu hoàn thành'}
          aria-label={done ? 'Bỏ hoàn thành' : 'Đánh dấu hoàn thành'}
        >
          <svg viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2.5 6.5L5 9l4.5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <span className="trow-icon" title={assigneeRole?.label ?? ''}>
          {assigneeRole?.icon ?? '📌'}
        </span>

        <span className="trow-title">
          <span className="trow-title-text">{task.title}</span>
          {subs.length > 0 && (
            <button
              className={`trow-st${expanded ? ' open' : ''}`}
              onClick={(e) => { e.stopPropagation(); setExpanded((o) => !o); }}
              title={expanded ? 'Thu gọn subtask' : 'Xem subtask'}
              aria-expanded={expanded}
              aria-label={`Subtask ${subDone}/${subs.length}`}
            >
              <svg viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="mono">{subDone}/{subs.length}</span>
            </button>
          )}
        </span>

        <span className="prio-pill trow-prio" style={{ color: PRIO_COLOR[task.priority] }}>
          <span className="prio-dot" style={{ background: PRIO_COLOR[task.priority] }} />
          {PRIORITY_LABEL[task.priority]}
        </span>

        {showAssignee &&
          (onClaim && !task.assigneeId && !done ? (
            <button
              className="trow-who trow-claim"
              onClick={(e) => { e.stopPropagation(); onClaim(task); }}
              title="Task chưa giao — bấm để tự nhận về mình"
            >
              <span className="trow-claim-plus" aria-hidden>+</span>
              Nhận task
            </button>
          ) : (
            <span className="trow-who">
              <MemberAvatar uid={task.assigneeId} name={task.assigneeName || '?'} size="sm" />
              <span className="trow-who-name">{task.assigneeName || 'Chưa giao'}</span>
            </span>
          ))}

        <span className={`trow-due mono${overdue ? ' overdue' : ''}`}>{fmtDay(task)}</span>

        <span className="trow-prog">
          <span className="progress"><span style={{ width: `${progress}%` }} /></span>
          <span className="trow-pct mono">{progress}%</span>
        </span>

        <span className="trow-status">{done ? 'Hoàn thành' : STATUS_LABEL[task.status]}</span>

        {/* Sau trạng thái: cờ đã gắn feature + đã tạo Notion (xem TaskFlags). */}
        <TaskFlags task={task} notionEnabled={notionEnabled} />

        <div className="tcard-menu-wrap" onClick={(e) => e.stopPropagation()} ref={menuRef}>
          <button className="tcard-menu" onClick={() => setMenuOpen((o) => !o)} aria-label="Tuỳ chọn">
            <MoreVerticalIcon size={16} />
          </button>
          {menuOpen && (
            <div className="tcard-menu-pop glass">
              <button onClick={toggleDone} disabled={!canChangeStatus}>
                {done ? 'Bỏ hoàn thành' : 'Đánh dấu hoàn thành'}
              </button>
              <button onClick={() => { setMenuOpen(false); onOpen(task); }}>Mở chi tiết</button>
              {onMoveSprint && !done && (
                <button onClick={() => { setMenuOpen(false); onMoveSprint(task); }}>
                  Chuyển sang sprint…
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Checklist xổ ngay dưới dòng — xem không cần mở chi tiết; bấm vào thì vẫn mở modal
          (tick subtask vốn cần quyền + đồng bộ Notion, để modal lo). */}
      {expanded && subs.length > 0 && (
        <div className="trow-subs" onClick={() => onOpen(task)}>
          {subs.map((s) => (
            <div key={s.id} className={`trow-sub${s.done ? ' done' : ''}`}>
              <span className="trow-sub-box" aria-hidden>
                <svg viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6.5L5 9l4.5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="trow-sub-title">{s.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
