import { useEffect, useRef, useState } from 'react';
import { Timestamp } from '../lib/time';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { becameDone, createTask, deleteTask, descWithLongTitle, syncTaskToNotion, updateTask } from '../lib/taskWrites';
import { useNotify } from '../contexts/NotifyContext';
import { formatDateRange, timeAgo, toInputDate } from '../lib/format';
import AttachmentsField from './task/AttachmentsField';
import SubtasksField from './task/SubtasksField';
import WatchersField from './task/WatchersField';
import PriorityBadge from './task/PriorityBadge';
import StatusToggle from './task/StatusToggle';
import RefImagesSection from './task/RefImagesSection';
import TaskActivity from './TaskActivity';
import ConfirmDialog from './ConfirmDialog';
import { FileIcon, PaperclipIcon } from './icons';
import type { Attachment, Subtask, Task, TaskPriority, TaskStatus } from '../types';

/** Section ref của feature là CHỈ ĐỌC — onChange bắt buộc nhưng không bao giờ chạy. */
const noop = () => {};

interface TaskModalProps {
  task?: Task | null;
  defaultSprintId: string | null;
  defaultProjectId?: string | null;
  defaultFeatureId?: string | null;
  defaultAssigneeId?: string | null;
  defaultStatus?: TaskStatus;
  onClose: () => void;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Full task detail view: header + info grid + subtasks + docs + activity feed.
 *  Edits autosave (debounced); creation is a single explicit action. */
export default function TaskModal({
  task,
  defaultSprintId,
  defaultProjectId,
  defaultFeatureId,
  defaultAssigneeId,
  defaultStatus,
  onClose,
}: TaskModalProps) {
  const { user, profile, isAdmin, can } = useAuth();
  const { members, sprints, projects, features } = useSprintContext();
  const { confirmDoneNotify } = useNotify();
  const isEdit = Boolean(task);

  // 3 mức quyền, từ hẹp đến rộng:
  // - canEditFields: priority/sprint/watchers/points — admin; create mode thì ai tạo cũng
  //   phải gõ được (points vẫn khoá riêng bằng isAdmin ở dưới).
  // - canEditOwn: TÊN task, người nhận, feature, hạn chót, subtask, mô tả, tài liệu —
  //   member sửa được trên task MÌNH TẠO (reporter). Trigger DB chặn points (0024).
  // - canChangeStatus: reporter/assignee đổi trạng thái (như cũ).
  const isOwner = !isEdit || task?.reporterId === user?.uid;
  const canEditFields = isAdmin || !isEdit;
  const canEditOwn = isAdmin || isOwner;
  const canChangeStatus = isAdmin || task?.assigneeId === user?.uid || task?.reporterId === user?.uid;
  const canSave = canEditFields || canEditOwn || canChangeStatus;
  // Xoá: admin hoặc member được cấp quyền lẻ 'task.delete' (RLS tasks_delete, 0034).
  const canDelete = can('task.delete');

  const [title, setTitle] = useState(task?.title ?? '');
  // Task cũ tên dài + mô tả trống: mở ra là ô Mô tả hiện luôn nguyên tiêu đề để đọc trọn
  // (input tiêu đề không xuống dòng). Chưa lưu tới khi có sửa gì đó — mở-để-đọc không ghi DB.
  const [description, setDescription] = useState(() => descWithLongTitle(task?.title ?? '', task?.description ?? ''));
  const [sprintId, setSprintId] = useState<string | null>(task?.sprintId ?? defaultSprintId);
  // Project isn't editable in the modal — you're already inside one.
  const [projectId] = useState<string | null>(task?.projectId ?? defaultProjectId ?? null);
  const [featureId, setFeatureId] = useState<string | null>(task?.featureId ?? defaultFeatureId ?? null);
  // Ref dùng chung của feature đang chọn — bám theo featureId nên đổi feature là đổi theo.
  const featureOfTask = features.find((f) => f.id === featureId) ?? null;
  const featureRefs = featureOfTask?.attachments ?? [];
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? defaultStatus ?? 'todo');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medium');
  const [assigneeId, setAssigneeId] = useState<string | null>(task?.assigneeId ?? defaultAssigneeId ?? null);
  const [points, setPoints] = useState<number>(task?.points ?? 0);
  // Tạo mới: hạn chót mặc định = ngày cuối của sprint đang chọn (cùng luật với bot,
  // xem task_ops._due_window). Người tạo vẫn đổi tay được trước khi bấm Tạo.
  const [due, setDue] = useState<string>(() => {
    if (task) return toInputDate(task.dueDate);
    const sprint = sprints.find((s) => s.id === defaultSprintId);
    return sprint?.endDate ? toInputDate(sprint.endDate) : '';
  });
  const [attachments, setAttachments] = useState<Attachment[]>(task?.attachments ?? []);
  const [subtasks, setSubtasks] = useState<Subtask[]>(task?.subtasks ?? []);
  const [watcherIds, setWatcherIds] = useState<string[]>(task?.watcherIds ?? []);
  const [creating, setCreating] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notionSyncing, setNotionSyncing] = useState(false);
  const [notionMsg, setNotionMsg] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  function copyTaskLink() {
    if (!task) return;
    // ?p= để link mở đúng dự án cả khi người nhận đang đứng ở dự án khác.
    const suffix = projectId ? `?p=${projectId}` : '';
    void navigator.clipboard.writeText(`${window.location.origin}/tasks/${task.id}${suffix}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1500);
  }

  const sprintName = sprints.find((s) => s.id === sprintId)?.name ?? 'Backlog';
  const projectName = projects.find((p) => p.id === projectId)?.name;
  const projectFeatures = features.filter((f) => f.projectId === projectId);
  // Progress is derived from subtasks; with none, a done task still reads 100%.
  const doneCount = subtasks.filter((s) => s.done).length;
  const progress = subtasks.length
    ? Math.round((doneCount / subtasks.length) * 100)
    : status === 'done' ? 100 : 0;

  // Autosave bookkeeping: a serialized snapshot of the last-persisted values, and
  // the last-saved task (so the done-transition + due-snap fire once, not per keystroke).
  const savedTaskRef = useRef<Task | null>(task ?? null);
  const snapshot = () =>
    JSON.stringify({ title, description, sprintId, featureId, status, priority, assigneeId, points, due, attachments, subtasks, watcherIds });
  const lastSavedRef = useRef<string | null>(null);
  if (lastSavedRef.current === null) lastSavedRef.current = snapshot();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function persist(): Promise<void> {
    const base = savedTaskRef.current;
    if (!base) return;
    if (!title.trim()) {
      setError('Cần nhập tên task.');
      return;
    }
    setError(null);
    setSaveState('saving');
    const assignee = members.find((m) => m.uid === assigneeId) ?? null;
    const project = projects.find((p) => p.id === projectId) ?? null;
    const notionProjectId = project?.notionProjectId ?? null;
    const watcherNames = watcherIds
      .map((id) => members.find((m) => m.uid === id)?.displayName ?? '')
      .filter(Boolean);
    const dueDate = due ? new Date(due) : null;
    const patch: Partial<Task> = {
      title: title.trim(), description: description.trim(), sprintId, projectId, featureId, status, priority, points,
      assigneeId, assigneeName: assignee?.displayName ?? '',
      dueDate: dueDate ? Timestamp.fromDate(dueDate) : null,
      attachments, subtasks, watcherIds, watcherNames,
    };
    const justFinished = becameDone(base.status, status);
    try {
      await updateTask(base, patch, assignee?.notionUserId ?? null, notionProjectId);
      const merged = { ...base, ...patch } as Task;
      savedTaskRef.current = merged;
      lastSavedRef.current = snapshot();
      setSaveState('saved');
      if (justFinished) confirmDoneNotify(merged, sprintName);
    } catch (err) {
      console.error('Tự động lưu thất bại', err);
      setSaveState('error');
      setError('Lưu thất bại. Kiểm tra quyền hoặc kết nối.');
    }
  }

  // Debounced autosave whenever an editable value changes (edit mode only).
  useEffect(() => {
    if (!isEdit || !canSave) return;
    if (snapshot() === lastSavedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void persist(), 700);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, sprintId, featureId, status, priority, assigneeId, points, due, attachments, subtasks, watcherIds]);

  async function handleClose() {
    if (timerRef.current) clearTimeout(timerRef.current);
    // Flush any pending edit before leaving so a quick close doesn't drop it.
    if (isEdit && canSave && snapshot() !== lastSavedRef.current) await persist();
    onClose();
  }

  async function handleCreate() {
    if (!title.trim()) return setError('Cần nhập tên task.');
    setCreating(true);
    setError(null);
    const assignee = members.find((m) => m.uid === assigneeId) ?? null;
    const project = projects.find((p) => p.id === projectId) ?? null;
    const notionProjectId = project?.notionProjectId ?? null;
    const watcherNames = watcherIds
      .map((id) => members.find((m) => m.uid === id)?.displayName ?? '')
      .filter(Boolean);
    const dueDate = due ? new Date(due) : null;
    try {
      await createTask(
        { title, description, sprintId, projectId, featureId, status, priority, points, assigneeId, dueDate, attachments, subtasks, watcherIds },
        { reporterId: user?.uid ?? '', assigneeName: assignee?.displayName ?? '', assigneeNotionUserId: assignee?.notionUserId ?? null, notionProjectId, watcherNames },
      );
      onClose();
    } catch (err) {
      console.error('Tạo task thất bại', err);
      setError('Tạo thất bại. Kiểm tra quyền hoặc kết nối.');
      setCreating(false);
    }
  }

  async function handleSyncNotion() {
    if (!task) return;
    setNotionSyncing(true);
    setNotionMsg(null);
    const assignee = members.find((m) => m.uid === assigneeId) ?? null;
    const project = projects.find((p) => p.id === projectId);
    try {
      await syncTaskToNotion(task, assignee?.notionUserId ?? null, project?.notionProjectId ?? null);
      // useLiveQuery sẽ tự nạp lại task (notion_page_id vừa đổi) -> link Notion hiện ra,
      // và chính nút này biến mất. Không cần tự set state cho task.
      setNotionMsg('✓ Đã tạo trên Notion');
    } catch (err) {
      console.error('Tạo task trên Notion thất bại', err);
      setNotionMsg(err instanceof Error ? err.message : 'Tạo trên Notion thất bại.');
    } finally {
      setNotionSyncing(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    try {
      await deleteTask(task);
      onClose();
    } catch {
      setConfirmDelete(false);
      setError('Xoá thất bại.');
    }
  }

  const saveHint =
    saveState === 'saving' ? 'Đang lưu…' :
    saveState === 'error' ? '⚠ Lưu lỗi' :
    saveState === 'saved' ? '✓ Đã lưu' : 'Tự động lưu';

  return (
    <div className="modal-overlay" onClick={() => void handleClose()}>
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
                  {isEdit && task && (
                    <button type="button" className="btn-sm" title={linkCopied ? 'Đã chép link' : 'Chép link task này'} onClick={copyTaskLink}>
                      {linkCopied ? '✓' : '🔗'}
                    </button>
                  )}
                  <PriorityBadge value={priority} onChange={setPriority} disabled={!canEditFields} />
                  <span className="tm-idrow-spacer" />
                  <StatusToggle value={status} onChange={setStatus} disabled={!canChangeStatus} />
                </div>
                {/* canEditOwn chứ không phải canEditFields: người tạo task sửa được TÊN
                    task của mình — gõ sai một chữ mà phải đi nhờ admin thì vô lý. RLS
                    tasks_update (0002) vốn đã cho reporter/assignee ghi cả hàng, nên đây
                    chỉ là mở đúng cái ô ở UI, không cần policy mới (xem 0024). */}
                <input
                  className="tmodal-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={!canEditOwn}
                  placeholder="Tên task"
                />
              </div>
              <button className="tmodal-x" onClick={() => void handleClose()} aria-label="Đóng">✕</button>
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
                disabled={!canEditOwn}
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
              <SubtasksField subtasks={subtasks} onChange={setSubtasks} canEdit={canEditOwn} canToggle={canChangeStatus} />
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
                  <span>Feature</span>
                  <select className="select" value={featureId ?? ''} onChange={(e) => setFeatureId(e.target.value || null)} disabled={!canEditOwn}>
                    <option value="">— Chưa gắn —</option>
                    {projectFeatures.map((f) => (<option key={f.id} value={f.id}>{f.icon} {f.name}</option>))}
                  </select>
                </label>
                <label className="tm-field">
                  <span>Người nhận</span>
                  <select className="select" value={assigneeId ?? ''} onChange={(e) => setAssigneeId(e.target.value || null)} disabled={!canEditOwn}>
                    <option value="">Chưa giao</option>
                    {members.map((m) => (<option key={m.uid} value={m.uid}>{m.displayName}</option>))}
                  </select>
                </label>
                <label className="tm-field">
                  <span>Hạn chót</span>
                  <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} disabled={!canEditOwn} />
                </label>
                <label className="tm-field">
                  <span>Story points</span>
                  {/* Story point: CHỈ admin — kể cả người tạo task (trigger 0024 chặn thêm ở DB). */}
                  <input className="input" type="number" min={0} value={points} onChange={(e) => setPoints(Number(e.target.value) || 0)} disabled={!isAdmin} />
                </label>
              </div>
              <WatchersField members={members} watcherIds={watcherIds} onChange={setWatcherIds} disabled={!canEditFields} />
            </section>

            {/* Tài liệu (chỉ link) */}
            <section className="tm-section">
              <h4 className="tm-h"><PaperclipIcon size={16} /> Tài liệu</h4>
              <AttachmentsField attachments={attachments} onChange={setAttachments} disabled={!canEditOwn} />
              {isEdit && task?.notionUrl && (
                <a className="notion-row" href={task.notionUrl} target="_blank" rel="noreferrer">📝 Mở task trên Notion →</a>
              )}
              {/* Chưa có trang Notion -> cho tạo lại bằng tay. Sync lúc tạo task là
                  fire-and-forget nên hỏng thì im lặng; đây là đường bù duy nhất. */}
              {isEdit && task && !task.notionPageId && canEditFields && (
                <div className="notion-sync-row">
                  <button className="btn-sm" onClick={handleSyncNotion} disabled={notionSyncing}>
                    {notionSyncing ? '⏳ Đang tạo trên Notion…' : '📝 Tạo task trên Notion'}
                  </button>
                  {notionMsg && <span className="notion-sync-msg muted">{notionMsg}</span>}
                </div>
              )}
            </section>

            {/* Ref — ảnh tham khảo, section riêng ở dưới cùng */}
            <RefImagesSection attachments={attachments} onChange={setAttachments} disabled={!canEditOwn} />

            {/* Ref dùng chung của feature — CHỈ ĐỌC, và đọc thẳng từ feature chứ không
                sao chép vào task: thêm ref vào feature sau này thì task cũ vẫn thấy ngay,
                và không có hai bản dữ liệu trôi lệch nhau. Sửa ở màn Features. */}
            {featureRefs.length > 0 && (
              <section className="tm-section feature-refs">
                <h4 className="tm-h">
                  {featureOfTask?.icon} Dùng chung của feature “{featureOfTask?.name}”
                </h4>
                <AttachmentsField attachments={featureRefs} onChange={noop} disabled />
                <RefImagesSection attachments={featureRefs} onChange={noop} disabled />
              </section>
            )}

            {error && <p className="error-text">{error}</p>}
          </div>

          {/* Footer: edits autosave (no Save/Cancel); creation is explicit. */}
          <div className="tmodal-footer">
            {isEdit && canDelete && (
              <button className="btn-sm btn-danger" onClick={() => setConfirmDelete(true)}>🗑 Xoá task</button>
            )}
            <div className="tmodal-foot-spacer" />
            {isEdit ? (
              canSave && <span className={`tm-savehint tm-save-${saveState}`}>{saveHint}</span>
            ) : (
              canSave && (
                <button className="btn-primary" onClick={handleCreate} disabled={creating}>
                  {creating ? 'Đang tạo…' : 'Tạo task'}
                </button>
              )
            )}
          </div>
        </div>

        {isEdit && task && (
          <TaskActivity taskId={task.id} actorId={user?.uid ?? ''} actorName={profile?.displayName ?? ''} />
        )}
      </div>

      {confirmDelete && task && (
        <ConfirmDialog
          title="Xoá task?"
          message={<>Task <strong>“{task.title}”</strong> sẽ bị xoá khỏi app.</>}
          detail={
            task.notionPageId
              ? 'Trang Notion đã liên kết cũng được đưa vào Trash (khôi phục được trong 30 ngày). Task trong app thì không khôi phục được.'
              : 'Không khôi phục được.'
          }
          confirmLabel="Xoá task"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
