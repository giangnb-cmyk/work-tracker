import { useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { createTask, deleteTask, updateTask } from '../lib/taskWrites';
import { toInputDate } from '../lib/format';
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '../types';

interface TaskModalProps {
  task?: Task | null;
  defaultSprintId: string | null;
  defaultStatus?: TaskStatus;
  onClose: () => void;
}

/** Create or edit a task. Assignee/sprint pulled from SprintContext. */
export default function TaskModal({ task, defaultSprintId, defaultStatus, onClose }: TaskModalProps) {
  const { user, isAdmin } = useAuth();
  const { members, sprints } = useSprintContext();
  const isEdit = Boolean(task);

  // Permission model: admins edit everything; a member may only change the STATUS
  // of a task they own (assignee or reporter). Everything else is read-only for them.
  const canEditFields = isAdmin;
  const canChangeStatus =
    isAdmin || task?.assigneeId === user?.uid || task?.reporterId === user?.uid;
  const canSave = canEditFields || canChangeStatus;

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [sprintId, setSprintId] = useState<string | null>(task?.sprintId ?? defaultSprintId);
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? defaultStatus ?? 'todo');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [assigneeId, setAssigneeId] = useState<string | null>(task?.assigneeId ?? null);
  const [points, setPoints] = useState<number>(task?.points ?? 0);
  const [due, setDue] = useState<string>(toInputDate(task?.dueDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim()) {
      setError('Cần nhập tên task.');
      return;
    }
    setSaving(true);
    setError(null);
    const assignee = members.find((m) => m.uid === assigneeId) ?? null;
    const dueDate = due ? new Date(due) : null;
    try {
      if (isEdit && task) {
        await updateTask(
          task,
          {
            title: title.trim(),
            description: description.trim(),
            sprintId,
            status,
            priority,
            points,
            assigneeId,
            assigneeName: assignee?.displayName ?? '',
            dueDate: dueDate ? Timestamp.fromDate(dueDate) : null,
          },
          assignee?.notionUserId ?? null,
          sprints.find((s) => s.id === sprintId)?.name,
        );
      } else {
        await createTask(
          { title, description, sprintId, status, priority, points, assigneeId, dueDate },
          {
            reporterId: user?.uid ?? '',
            assigneeName: assignee?.displayName ?? '',
            assigneeNotionUserId: assignee?.notionUserId ?? null,
          },
        );
      }
      onClose();
    } catch (err) {
      console.error('Save task failed', err);
      setError('Lưu thất bại. Kiểm tra quyền hoặc kết nối.');
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    if (!confirm(`Xoá task "${task.title}"?`)) return;
    setSaving(true);
    try {
      await deleteTask(task.id);
      onClose();
    } catch {
      setError('Xoá thất bại.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? 'Sửa task' : 'Task mới'}</h2>

        <label className="field">
          <span>Tên task *</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canEditFields} autoFocus />
        </label>

        <label className="field">
          <span>Mô tả</span>
          <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canEditFields} />
        </label>

        <div className="grid-2">
          <label className="field">
            <span>Sprint</span>
            <select
              className="select"
              value={sprintId ?? 'backlog'}
              onChange={(e) => setSprintId(e.target.value === 'backlog' ? null : e.target.value)}
              disabled={!canEditFields}
            >
              <option value="backlog">Backlog</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Trạng thái</span>
            <select
              className="select"
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              disabled={!canChangeStatus}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid-2">
          <label className="field">
            <span>Người nhận</span>
            <select
              className="select"
              value={assigneeId ?? ''}
              onChange={(e) => setAssigneeId(e.target.value || null)}
              disabled={!canEditFields}
            >
              <option value="">Chưa giao</option>
              {members.map((m) => (
                <option key={m.uid} value={m.uid}>{m.displayName}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Độ ưu tiên</span>
            <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} disabled={!canEditFields}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid-2">
          <label className="field">
            <span>Story points</span>
            <input
              className="input"
              type="number"
              min={0}
              value={points}
              onChange={(e) => setPoints(Number(e.target.value) || 0)}
              disabled={!canEditFields}
            />
          </label>
          <label className="field">
            <span>Hạn chót</span>
            <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} disabled={!canEditFields} />
          </label>
        </div>

        {task?.notionUrl && (
          <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }}>
            🔗 <a href={task.notionUrl} target="_blank" rel="noreferrer">Mở trên Notion</a>
          </p>
        )}
        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          {isEdit && isAdmin && (
            <button className="btn-sm btn-danger" onClick={handleDelete} disabled={saving} style={{ marginRight: 'auto' }}>
              Xoá
            </button>
          )}
          <button className="btn-sm" onClick={onClose} disabled={saving}>Đóng</button>
          {canSave && (
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Đang lưu…' : isEdit ? 'Lưu' : 'Tạo task'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
