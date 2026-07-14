import { useState } from 'react';
import { Timestamp } from '../lib/time';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { becameDone, createTask, deleteTask, updateTask } from '../lib/taskWrites';
import { useNotify } from '../contexts/NotifyContext';
import { formatDateRange, timeAgo, toInputDate } from '../lib/format';
import AttachmentsField from './task/AttachmentsField';
import SubtasksField from './task/SubtasksField';
import WatchersField from './task/WatchersField';
import PriorityBadge from './task/PriorityBadge';
import StatusToggle from './task/StatusToggle';
import RefImagesSection from './task/RefImagesSection';
import TaskActivity from './TaskActivity';
import { FileIcon, PaperclipIcon } from './icons';
import type { Attachment, Subtask, Task, TaskPriority, TaskStatus } from '../types';

interface TaskModalProps {
  task?: Task | null;
  defaultSprintId: string | null;
  defaultProjectId?: string | null;
  defaultStatus?: TaskStatus;
  onClose: () => void;
}

/** Full task detail view: header + info grid + subtasks + docs + activity feed. */
export default function TaskModal({ task, defaultSprintId, defaultProjectId, defaultStatus, onClose }: TaskModalProps) {
  const { user, profile, isAdmin } = useAuth();
  const { members, sprints, projects } = useSprintContext();
  const { confirmDoneNotify } = useNotify();
  const isEdit = Boolean(task);

  const canEditFields = isAdmin;
  const canChangeStatus = isAdmin || task?.assigneeId === user?.uid || task?.reporterId === user?.uid;
  const canSave = canEditFields || canChangeStatus;

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [sprintId, setSprintId] = useState<string | null>(task?.sprintId ?? defaultSprintId);
  // Project isn't editable in the modal — you're already inside one. New tasks
  // auto-inherit the currently selected project; edits keep the task's project.
  const [projectId] = useState<string | null>(task?.projectId ?? defaultProjectId ?? null);
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? defaultStatus ?? 'todo');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [assigneeId, setAssigneeId] = useState<string | null>(task?.assigneeId ?? null);
  const [points, setPoints] = useState<number>(task?.points ?? 0);
  const [due, setDue] = useState<string>(toInputDate(task?.dueDate));
  const [attachments, setAttachments] = useState<Attachment[]>(task?.attachments ?? []);
  const [subtasks, setSubtasks] = useState<Subtask[]>(task?.subtasks ?? []);
  const [watcherIds, setWatcherIds] = useState<string[]>(task?.watcherIds ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sprintName = sprints.find((s) => s.id === sprintId)?.name ?? 'Backlog';
  const projectName = projects.find((p) => p.id === projectId)?.name;
  // Progress is derived from subtasks; with none, a done task still reads 100%.
  const doneCount = subtasks.filter((s) => s.done).length;
  const progress = subtasks.length
    ? Math.round((doneCount / subtasks.length) * 100)
    : status === 'done' ? 100 : 0;

  async function handleSave() {
    if (!title.trim()) return setError('Cần nhập tên task.');
    setSaving(true);
    setError(null);
    const assignee = members.find((m) => m.uid === assigneeId) ?? null;
    const project = projects.find((p) => p.id === projectId) ?? null;
    const notionProjectId = project?.notionProjectId ?? null;
    const watcherNames = watcherIds.map((id) => members.find((m) => m.uid === id)?.displayName ?? '').filter(Boolean);
    const dueDate = due ? new Date(due) : null;
    try {
      if (isEdit && task) {
        const patch = {
          title: title.trim(), description: description.trim(), sprintId, projectId, status, priority, points,
          assigneeId, assigneeName: assignee?.displayName ?? '',
          dueDate: dueDate ? Timestamp.fromDate(dueDate) : null,
          attachments, subtasks, watcherIds, watcherNames,
        };
        const justFinished = becameDone(task.status, status);
        await updateTask(task, patch, assignee?.notionUserId ?? null, notionProjectId);
        if (justFinished) confirmDoneNotify({ ...task, ...patch }, sprintName);
      } else {
        await createTask(
          { title, description, sprintId, projectId, status, priority, points, assigneeId, dueDate, attachments, subtasks, watcherIds },
          { reporterId: user?.uid ?? '', assigneeName: assignee?.displayName ?? '', assigneeNotionUserId: assignee?.notionUserId ?? null, notionProjectId, watcherNames },
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
    if (!task || !window.confirm(`Xoá task "${task.title}"?`)) return;
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
      <div className="tmodal" onClick={(e) => e.stopPropagation()}>
        <div className="tmodal-main">
          {/* Header: icon · #id · priority · status switch · close */}
          <div className="tmodal-header">
            <div className="tmodal-htop">
              <span className="tmodal-icon">📌</span>
              <div className="tmodal-hid">
                <div className="tm-idrow">
                  {isEdit && task && (
                    <span className="tm-id mono" title={task.id}>#{task.id.slice(0, 6).toUpperCase()}</span>
                  )}
                  <PriorityBadge value={priority} onChange={setPriority} disabled={!canEditFields} />
                  <span className="tm-idrow-spacer" />
                  <StatusToggle value={status} onChange={setStatus} disabled={!canChangeStatus} />
                </div>
                <input
                  className="tmodal-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={!canEditFields}
                  placeholder="Tên task"
                />
              </div>
              <button className="tmodal-x" onClick={onClose} aria-label="Đóng">✕</button>
            </div>
            {isEdit && (
              <div className="tmodal-crumb">
                <span>📁 {sprintName}</span>
                {projectName && <><span className="crumb-sep">›</span><span>🗂️ {projectName}</span></>}
                <span className="crumb-sep">›</span>
                <span>📅 {formatDateRange(task?.dueStart, task?.dueDate)}</span>
                <span className="crumb-sep">›</span>
                <span>🕐 Cập nhật {timeAgo(task?.updatedAt) || 'vừa xong'}</span>
              </div>
            )}
          </div>

          <div className="tmodal-scroll">
            {/* Mô tả + tiến độ tổng */}
            <section className="tm-section">
              <h4 className="tm-h"><FileIcon size={16} /> Mô tả</h4>
              <textarea
                className="textarea tm-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canEditFields}
                placeholder="Mô tả công việc…"
              />
              <div className="tm-progress" title="Tự tính từ subtask đã hoàn thành">
                <span className="tm-progress-label">Tiến độ tổng</span>
                <span className="progress"><span style={{ width: `${progress}%` }} /></span>
                <span className="tm-progress-pct mono">{progress}%</span>
              </div>
            </section>

            {/* Subtasks — ngay dưới thanh tiến độ (tiến độ tính từ đây) */}
            <section className="tm-section">
              <SubtasksField subtasks={subtasks} onChange={setSubtasks} canEdit={canEditFields} canToggle={canChangeStatus} />
            </section>

            {/* Thông tin — status & priority sống ở header, không lặp lại ở đây */}
            <section className="tm-section">
              <h4 className="tm-h">Thông tin</h4>
              <div className="tm-info">
                <label className="tm-field">
                  <span>Sprint</span>
                  <select className="select" value={sprintId ?? 'backlog'} onChange={(e) => setSprintId(e.target.value === 'backlog' ? null : e.target.value)} disabled={!canEditFields}>
                    <option value="backlog">Backlog</option>
                    {sprints.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                  </select>
                </label>
                <label className="tm-field">
                  <span>Hạn chót</span>
                  <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} disabled={!canEditFields} />
                </label>
                <label className="tm-field">
                  <span>Người nhận</span>
                  <select className="select" value={assigneeId ?? ''} onChange={(e) => setAssigneeId(e.target.value || null)} disabled={!canEditFields}>
                    <option value="">Chưa giao</option>
                    {members.map((m) => (<option key={m.uid} value={m.uid}>{m.displayName}</option>))}
                  </select>
                </label>
                <label className="tm-field">
                  <span>Story points</span>
                  <input className="input" type="number" min={0} value={points} onChange={(e) => setPoints(Number(e.target.value) || 0)} disabled={!canEditFields} />
                </label>
              </div>
              <WatchersField members={members} watcherIds={watcherIds} onChange={setWatcherIds} disabled={!canEditFields} />
            </section>

            {/* Tài liệu (chỉ link) */}
            <section className="tm-section">
              <h4 className="tm-h"><PaperclipIcon size={16} /> Tài liệu</h4>
              <AttachmentsField attachments={attachments} onChange={setAttachments} disabled={!canEditFields} />
              {isEdit && task?.notionUrl && (
                <a className="notion-row" href={task.notionUrl} target="_blank" rel="noreferrer">📝 Mở task trên Notion →</a>
              )}
            </section>

            {/* Ref — ảnh tham khảo, section riêng ở dưới cùng */}
            <RefImagesSection attachments={attachments} onChange={setAttachments} disabled={!canEditFields} />

            {error && <p className="error-text">{error}</p>}
          </div>

          {/* Footer */}
          <div className="tmodal-footer">
            {isEdit && isAdmin && (
              <button className="btn-sm btn-danger" onClick={handleDelete} disabled={saving}>🗑 Xoá task</button>
            )}
            <div className="tmodal-foot-spacer" />
            <button className="btn-sm" onClick={onClose} disabled={saving}>Huỷ</button>
            {canSave && (
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Đang lưu…' : isEdit ? 'Lưu thay đổi' : 'Tạo task'}
              </button>
            )}
          </div>
        </div>

        {isEdit && task && (
          <TaskActivity taskId={task.id} actorId={user?.uid ?? ''} actorName={profile?.displayName ?? ''} />
        )}
      </div>
    </div>
  );
}
