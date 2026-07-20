import { useCallback, useRef, useState } from 'react';
import Avatar from './Avatar';
import TaskFlags from './task/TaskFlags';
import { daysUntil } from '../lib/format';
import { taskProgress } from '../lib/sprint';
import { providerMeta } from '../lib/attachments';
import { useClickOutside } from '../hooks/useClickOutside';
import {
  CalendarIcon,
  CheckSquareIcon,
  FileIcon,
  MoreVerticalIcon,
  PaperclipIcon,
} from './icons';
import {
  JOB_ROLE_ICON,
  JOB_ROLE_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type Attachment,
  type JobRole,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '../types';
import type { Timestamp } from '../lib/time';

interface TaskRowProps {
  task: Task;
  assigneeJobRole?: JobRole;
  canChangeStatus: boolean;
  onOpen: (task: Task) => void;
  onQuickStatus: (task: Task, status: TaskStatus) => void;
  /** Optional: chỉ màn có sprint mới cần mục "Chuyển sang sprint…". */
  onMoveSprint?: (task: Task) => void;
}

const UNDONE_STATUS: TaskStatus = 'in_progress';

// Priority → dot color (medium = amber, matching the reference card).
const PRIO_COLOR: Record<TaskPriority, string> = {
  low: '#94a3b8',
  medium: '#fbbf24',
  high: '#fb923c',
  urgent: '#ef4444',
};

interface Doc {
  url: string;
  name: string;
  provider: string;
  isImage: boolean;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function fmtDay(ts: Timestamp | null | undefined): string {
  if (!ts) return '';
  return ts.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/** One square document tile: image thumbnail, or the site favicon (emoji fallback). */
function DocTile({ doc }: { doc: Doc }) {
  const [failed, setFailed] = useState(false);
  const favicon = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(hostOf(doc.url) || doc.provider)}`;
  return (
    <a
      className="doc-tile"
      href={doc.url}
      target="_blank"
      rel="noreferrer"
      title={doc.name}
      onClick={(e) => e.stopPropagation()}
    >
      {doc.isImage ? (
        <img className="doc-cover" src={doc.url} alt={doc.name} />
      ) : failed ? (
        <span className="doc-emoji">{providerMeta(doc.provider).icon}</span>
      ) : (
        <img className="doc-logo" src={favicon} alt={doc.provider} onError={() => setFailed(true)} />
      )}
    </a>
  );
}

/** Rich task card matching the reference design. */
export default function TaskRow({
  task,
  assigneeJobRole,
  canChangeStatus,
  onOpen,
  onQuickStatus,
  onMoveSprint,
}: TaskRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useClickOutside(menuRef, closeMenu, menuOpen);
  const done = task.status === 'done';
  const progress = taskProgress(task);
  const subs = task.subtasks ?? [];
  const subDone = subs.filter((s) => s.done).length;
  const overdue = !done && task.dueDate && (daysUntil(task.dueDate) ?? 1) < 0;

  const atts = task.attachments ?? [];
  const docs: Doc[] = [
    ...(task.notionUrl ? [{ url: task.notionUrl, name: 'Notion', provider: 'notion', isImage: false }] : []),
    ...atts.map((a: Attachment) => ({ url: a.url, name: a.name, provider: a.provider, isImage: a.kind === 'image' })),
  ];

  const dueText =
    task.dueStart && task.dueDate
      ? `${fmtDay(task.dueStart)} → ${fmtDay(task.dueDate)}`
      : fmtDay(task.dueDate ?? task.dueStart) || '—';

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
    <div className={`tcard glass${done ? ' done' : ''}`} onClick={() => onOpen(task)}>
      {/* Header: role icon · title · priority pill · menu */}
      <div className="tcard-head">
        <span className="tcard-icon" title={assigneeJobRole ? JOB_ROLE_LABEL[assigneeJobRole] : ''}>
          {assigneeJobRole ? JOB_ROLE_ICON[assigneeJobRole] : '📌'}
        </span>
        <h3 className="tcard-title">{task.title}</h3>
        {/* Cờ đã gắn feature + đã tạo Notion — cùng TaskFlags với dòng list. */}
        <TaskFlags task={task} />
        <span className="prio-pill" style={{ color: PRIO_COLOR[task.priority] }}>
          <span className="prio-dot" style={{ background: PRIO_COLOR[task.priority] }} />
          {PRIORITY_LABEL[task.priority]}
        </span>
        <div className="tcard-menu-wrap" onClick={(e) => e.stopPropagation()} ref={menuRef}>
          <button className="tcard-menu" onClick={() => setMenuOpen((o) => !o)} aria-label="Tuỳ chọn">
            <MoreVerticalIcon size={18} />
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

      {/* Progress + percent + status */}
      <div className="tcard-progrow">
        <div className="progress"><span style={{ width: `${progress}%` }} /></div>
        <span className="tcard-pct">{progress}%</span>
      </div>
      <div className="tcard-status">{done ? 'Hoàn thành' : STATUS_LABEL[task.status]}</div>

      <div className="tcard-divider" />

      {/* 2×2 meta grid */}
      <div className="tcard-grid">
        <div className="tcard-cell">
          <Avatar name={task.assigneeName || '?'} size="md" />
          <div className="tcard-cell-text">
            <span className="tcard-val">{task.assigneeName || 'Chưa giao'}</span>
            <span className="tcard-lbl">Assignee</span>
          </div>
        </div>
        <div className="tcard-cell">
          <span className="tcard-tile tile-indigo"><CalendarIcon size={20} /></span>
          <div className="tcard-cell-text">
            <span className={`tcard-val mono${overdue ? ' overdue' : ''}`}>{dueText}</span>
            {/* "Thời gian thực hiện" quá dài cho ô này ở cỡ 0.8rem — vỡ 2 dòng. */}
            <span className="tcard-lbl">Thời gian</span>
          </div>
        </div>
        <div className="tcard-cell">
          <span className="tcard-tile tile-green"><CheckSquareIcon size={20} /></span>
          <div className="tcard-cell-text">
            <span className="tcard-val mono">{subDone} / {subs.length}</span>
            <span className="tcard-lbl">Subtasks</span>
          </div>
        </div>
        <div className="tcard-cell">
          <span className="tcard-tile tile-slate"><PaperclipIcon size={20} /></span>
          <div className="tcard-cell-text">
            <span className="tcard-val mono">{docs.length}</span>
            <span className="tcard-lbl">Tài liệu</span>
          </div>
        </div>
      </div>

      {docs.length > 0 && (
        <>
          <div className="tcard-divider" />
          <div className="tcard-docs">
            <span className="tcard-docs-label"><FileIcon size={16} /> Tài liệu</span>
            <div className="tcard-doc-tiles">
              {docs.map((d, i) => (
                <DocTile key={`${d.url}-${i}`} doc={d} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
