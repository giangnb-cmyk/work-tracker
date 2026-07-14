import Avatar from './Avatar';
import { daysUntil, formatDate } from '../lib/format';
import { PRIORITY_LABEL, type Task } from '../types';

interface TaskCardProps {
  task: Task;
  onClick: (task: Task) => void;
  onDragStart: (task: Task) => void;
  onDragEnd: () => void;
  dragging: boolean;
  canDrag: boolean;
}

export default function TaskCard({ task, onClick, onDragStart, onDragEnd, dragging, canDrag }: TaskCardProps) {
  const overdue = task.status !== 'done' && task.dueDate && (daysUntil(task.dueDate) ?? 1) < 0;

  return (
    <div
      className={`task-card${dragging ? ' dragging' : ''}`}
      style={canDrag ? undefined : { cursor: 'pointer' }}
      draggable={canDrag}
      onDragStart={() => canDrag && onDragStart(task)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(task)}
    >
      <div className="title">{task.title}</div>
      <div className="meta">
        <div className="meta-left">
          <span className={`badge prio-${task.priority}`}>{PRIORITY_LABEL[task.priority]}</span>
          {task.points > 0 && <span className="points">{task.points} pt</span>}
          {task.notionUrl && (
            <a
              className="notion-link"
              href={task.notionUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Mở trên Notion"
            >
              🔗
            </a>
          )}
        </div>
        {task.assigneeName ? (
          <Avatar name={task.assigneeName} size="sm" />
        ) : (
          <span className="muted" style={{ fontSize: '0.7rem' }}>Chưa giao</span>
        )}
      </div>
      {task.dueDate && (
        <div className={`due${overdue ? ' overdue' : ''}`} style={{ marginTop: '0.4rem' }}>
          {overdue ? '⚠ Quá hạn ' : '📅 '}
          {formatDate(task.dueDate)}
        </div>
      )}
    </div>
  );
}
