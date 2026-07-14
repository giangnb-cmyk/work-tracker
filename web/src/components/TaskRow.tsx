import Avatar from './Avatar';
import { daysUntil, formatDate } from '../lib/format';
import { taskProgress } from '../lib/sprint';
import { providerMeta } from '../lib/attachments';
import { PRIORITY_LABEL, STATUS_LABEL, TASK_STATUSES, type Task, type TaskStatus } from '../types';

interface TaskRowProps {
  task: Task;
  canChangeStatus: boolean;
  onOpen: (task: Task) => void;
  onQuickStatus: (task: Task, status: TaskStatus) => void;
}

/** One row in the sprint task list: title, meta, attachments, and a progress bar. */
export default function TaskRow({ task, canChangeStatus, onOpen, onQuickStatus }: TaskRowProps) {
  const progress = taskProgress(task);
  const subs = task.subtasks ?? [];
  const links = (task.attachments ?? []).filter((a) => a.kind === 'link');
  const images = (task.attachments ?? []).filter((a) => a.kind === 'image');
  const overdue = task.status !== 'done' && task.dueDate && (daysUntil(task.dueDate) ?? 1) < 0;

  return (
    <div className="task-row glass" onClick={() => onOpen(task)}>
      <div className="row-main">
        <div className="row-title">
          {task.title}
          {task.notionUrl && (
            <a className="attach-chip" href={task.notionUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Task trên Notion">📝</a>
          )}
          {links.map((a) => (
            <a key={a.id} className="attach-chip" href={a.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title={a.name}>
              {providerMeta(a.provider).icon}
            </a>
          ))}
          {images.length > 0 && <span className="attach-chip" title={`${images.length} ảnh`}>🖼️{images.length > 1 ? images.length : ''}</span>}
        </div>
        <div className="row-sub">
          <span className={`badge prio-${task.priority}`}>{PRIORITY_LABEL[task.priority]}</span>
          {task.points > 0 && <span className="points">{task.points} pt</span>}
          {subs.length > 0 && <span className="mono">☑ {subs.filter((s) => s.done).length}/{subs.length}</span>}
          {task.dueDate && <span className={overdue ? 'due overdue' : ''}>{overdue ? '⚠ ' : '📅 '}{formatDate(task.dueDate)}</span>}
        </div>
      </div>

      <div className="row-right" onClick={(e) => e.stopPropagation()}>
        <div className="progress-wrap">
          <div className="progress-label">{progress}%</div>
          <div className="progress"><span style={{ width: `${progress}%` }} /></div>
        </div>
        {canChangeStatus ? (
          <select
            className="select"
            style={{ width: 'auto', padding: '0.35rem 0.5rem' }}
            value={task.status}
            onChange={(e) => onQuickStatus(task, e.target.value as TaskStatus)}
            title="Đổi trạng thái"
          >
            {TASK_STATUSES.map((s) => (<option key={s} value={s}>{STATUS_LABEL[s]}</option>))}
          </select>
        ) : (
          <span className={`badge status-${task.status === 'done' ? 'completed' : task.status === 'todo' ? 'planning' : 'active'}`}>
            {STATUS_LABEL[task.status]}
          </span>
        )}
        {task.assigneeName ? (
          <Avatar name={task.assigneeName} size="sm" />
        ) : (
          <span className="muted" style={{ fontSize: '0.7rem' }}>Chưa giao</span>
        )}
      </div>
    </div>
  );
}
