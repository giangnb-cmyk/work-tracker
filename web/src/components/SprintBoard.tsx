import { useMemo, useState } from 'react';
import { useSprintContext } from '../contexts/SprintContext';
import { useTasks } from '../hooks/useTasks';
import { moveTask } from '../lib/taskWrites';
import TaskCard from './TaskCard';
import TaskModal from './TaskModal';
import { STATUS_LABEL, TASK_STATUSES, type Task, type TaskStatus } from '../types';

/** Kanban board for the selected sprint (or backlog). Native HTML5 drag-and-drop. */
export default function SprintBoard() {
  const { selectedSprintId, selectedSprint } = useSprintContext();
  const { tasks, loading } = useTasks(selectedSprintId);

  const [dragging, setDragging] = useState<Task | null>(null);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);

  const byStatus = useMemo(() => {
    const groups: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], review: [], done: [] };
    for (const t of tasks) groups[t.status].push(t);
    return groups;
  }, [tasks]);

  async function handleDrop(status: TaskStatus) {
    setDragOver(null);
    if (!dragging || dragging.status === status) return;
    // Place at the end of the target column.
    const col = byStatus[status];
    const lastOrder = col.length > 0 ? col[col.length - 1].order : 0;
    await moveTask(dragging, status, lastOrder + 1000);
    setDragging(null);
  }

  return (
    <div className="fade-in">
      <div className="view-header">
        <h1>{selectedSprint ? selectedSprint.name : 'Backlog'}</h1>
        <p>{selectedSprint?.goal || 'Kéo-thả thẻ để đổi trạng thái. Nhấn thẻ để sửa chi tiết.'}</p>
      </div>

      {loading ? (
        <div className="center-screen" style={{ minHeight: 200 }}>
          <div className="spinner" />
        </div>
      ) : (
        <div className="board">
          {TASK_STATUSES.map((status) => (
            <div
              key={status}
              className={`column${dragOver === status ? ' drag-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(status);
              }}
              onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
              onDrop={() => handleDrop(status)}
            >
              <div className="column-head">
                <span>
                  <span className={`column-dot dot-${status}`} />
                  {STATUS_LABEL[status]}
                </span>
                <span className="count">{byStatus[status].length}</span>
              </div>
              {byStatus[status].map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  dragging={dragging?.id === t.id}
                  onClick={setEditing}
                  onDragStart={setDragging}
                  onDragEnd={() => setDragging(null)}
                />
              ))}
              {byStatus[status].length === 0 && (
                <div className="muted" style={{ fontSize: '0.78rem', padding: '0.5rem' }}>
                  Trống
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <TaskModal task={editing} defaultSprintId={selectedSprintId} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
