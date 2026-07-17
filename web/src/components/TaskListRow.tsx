import { useCallback, useRef, useState } from 'react';
import Avatar from './Avatar';
import { daysUntil } from '../lib/format';
import { taskProgress } from '../lib/sprint';
import { PRIO_COLOR } from '../lib/taskColors';
import { MoreVerticalIcon } from './icons';
import { useClickOutside } from '../hooks/useClickOutside';
import {
  JOB_ROLE_ICON,
  JOB_ROLE_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type JobRole,
  type Task,
  type TaskStatus,
} from '../types';

interface TaskListRowProps {
  task: Task;
  assigneeJobRole?: JobRole;
  canChangeStatus: boolean;
  onOpen: (task: Task) => void;
  onQuickStatus: (task: Task, status: TaskStatus) => void;
  onMoveSprint?: (task: Task) => void;
  /** Ẩn cột người nhận ở màn chỉ có task của chính mình. */
  showAssignee?: boolean;
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
  assigneeJobRole,
  canChangeStatus,
  onOpen,
  onQuickStatus,
  onMoveSprint,
  showAssignee = true,
}: TaskListRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useClickOutside(menuRef, closeMenu, menuOpen);
  const done = task.status === 'done';
  const progress = taskProgress(task);
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

      <span className="trow-icon" title={assigneeJobRole ? JOB_ROLE_LABEL[assigneeJobRole] : ''}>
        {assigneeJobRole ? JOB_ROLE_ICON[assigneeJobRole] : '📌'}
      </span>

      <span className="trow-title">{task.title}</span>

      <span className="prio-pill trow-prio" style={{ color: PRIO_COLOR[task.priority] }}>
        <span className="prio-dot" style={{ background: PRIO_COLOR[task.priority] }} />
        {PRIORITY_LABEL[task.priority]}
      </span>

      {showAssignee && (
        <span className="trow-who">
          <Avatar name={task.assigneeName || '?'} size="sm" />
          <span className="trow-who-name">{task.assigneeName || 'Chưa giao'}</span>
        </span>
      )}

      <span className={`trow-due mono${overdue ? ' overdue' : ''}`}>{fmtDay(task)}</span>

      <span className="trow-prog">
        <span className="progress"><span style={{ width: `${progress}%` }} /></span>
        <span className="trow-pct mono">{progress}%</span>
      </span>

      <span className="trow-status">{done ? 'Hoàn thành' : STATUS_LABEL[task.status]}</span>

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
  );
}
