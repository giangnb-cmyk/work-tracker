import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSprintContext } from '../../contexts/SprintContext';
import { createBug, deleteBug, updateBug } from '../../lib/bugWrites';
import { createBugLabel } from '../../lib/bugLabelWrites';
import { labelsForStatus } from '../../lib/bugStatus';
import { formatDate } from '../../lib/format';
import BugLabelChip from './BugLabelChip';
import { BUG_STATUSES, BUG_STATUS_LABEL, type Bug, type BugLabel, type BugStatus } from '../../types';

interface Props {
  bug?: Bug | null;
  projectId: string;
  labels: BugLabel[];
  defaultStatus?: BugStatus;
  onClose: () => void;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
const SWATCHES = ['#a855f7', '#ef4444', '#f59e0b', '#eab308', '#fb923c', '#6366f1', '#22c55e', '#f472b6', '#38bdf8', '#10b981', '#64748b'];

/** Create/edit a bug. Edits autosave (debounced); creation is explicit. */
export default function BugModal({ bug, projectId, labels, defaultStatus, onClose }: Props) {
  const { user, profile, isAdmin } = useAuth();
  const { members } = useSprintContext();
  const isEdit = Boolean(bug);
  const canEdit = !isEdit || isAdmin || bug?.reporterId === user?.uid || bug?.assigneeId === user?.uid;

  const [title, setTitle] = useState(bug?.title ?? '');
  const [description, setDescription] = useState(bug?.description ?? '');
  const [status, setStatus] = useState<BugStatus>(bug?.status ?? defaultStatus ?? 'open');
  const [assigneeId, setAssigneeId] = useState<string | null>(bug?.assigneeId ?? null);
  const [labelIds, setLabelIds] = useState<string[]>(bug?.labelIds ?? []);
  const [creating, setCreating] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);

  // Inline "new label" form (admin).
  const [showNewLabel, setShowNewLabel] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('');
  const [newColor, setNewColor] = useState(SWATCHES[0]);

  const snapshot = () => JSON.stringify({ title, description, status, assigneeId, labelIds });
  const savedRef = useRef<string | null>(null);
  if (savedRef.current === null) savedRef.current = snapshot();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function toggleLabel(id: string) {
    setLabelIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  // Changing status swaps the matching workflow tag so the card + Discord stay in sync.
  function changeStatus(next: BugStatus) {
    setStatus(next);
    setLabelIds((ids) => labelsForStatus(ids, next, labels));
  }

  async function persist() {
    if (!bug) return;
    if (!title.trim()) { setError('Cần nhập tiêu đề bug.'); return; }
    setError(null);
    setSaveState('saving');
    const assignee = members.find((m) => m.uid === assigneeId) ?? null;
    // If this bug came from a Discord thread and its labels changed here, flag it
    // so the bot pushes the new tag set back to the forum.
    const key = (ids: string[]) => [...ids].sort().join(',');
    const labelsChanged = key(labelIds) !== key(bug.labelIds ?? []);
    const pushBack = Boolean(bug.discordThreadId) && labelsChanged;
    try {
      await updateBug(bug.id, {
        title: title.trim(), description: description.trim(), status, labelIds,
        assigneeId, assigneeName: assignee?.displayName ?? '',
        ...(pushBack ? { pendingDiscordPush: true } : {}),
      });
      savedRef.current = snapshot();
      setSaveState('saved');
    } catch (err) {
      console.error('Bug autosave failed', err);
      setSaveState('error');
      setError('Lưu thất bại. Kiểm tra quyền hoặc kết nối.');
    }
  }

  useEffect(() => {
    if (!isEdit || !canEdit) return;
    if (snapshot() === savedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void persist(), 700);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, status, assigneeId, labelIds]);

  async function handleClose() {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (isEdit && canEdit && snapshot() !== savedRef.current) await persist();
    onClose();
  }

  async function handleCreate() {
    if (!title.trim()) return setError('Cần nhập tiêu đề bug.');
    setCreating(true);
    setError(null);
    const assignee = members.find((m) => m.uid === assigneeId) ?? null;
    try {
      await createBug({
        projectId, title, description, status, labelIds,
        assigneeId, assigneeName: assignee?.displayName ?? '',
        reporterId: user?.uid ?? null, reporterName: profile?.displayName ?? '',
      });
      onClose();
    } catch (err) {
      console.error('Create bug failed', err);
      setError('Tạo bug thất bại.');
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!bug || !window.confirm(`Xoá bug "${bug.title}"?`)) return;
    try {
      await deleteBug(bug.id);
      onClose();
    } catch {
      setError('Xoá thất bại.');
    }
  }

  async function addLabel() {
    const name = newName.trim();
    if (!name) return;
    try {
      const id = await createBugLabel({ projectId, name, color: newColor, icon: newIcon.trim() }, user?.uid ?? '');
      setLabelIds((ids) => [...ids, id]);
      setNewName(''); setNewIcon(''); setShowNewLabel(false);
    } catch (err) {
      console.error('Create label failed', err);
      setError('Tạo nhãn thất bại (cần quyền admin).');
    }
  }

  const canDelete = isEdit && (isAdmin || bug?.reporterId === user?.uid);
  const saveHint = saveState === 'saving' ? 'Đang lưu…' : saveState === 'error' ? '⚠ Lưu lỗi' : saveState === 'saved' ? '✓ Đã lưu' : 'Tự động lưu';

  return (
    <div className="modal-overlay" onClick={() => void handleClose()}>
      <div className="modal bug-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bug-modal-head">
          {isEdit && bug && <span className="bug-num mono">#{bug.number}</span>}
          <select className="select bug-status-sel" value={status} onChange={(e) => changeStatus(e.target.value as BugStatus)} disabled={!canEdit}>
            {BUG_STATUSES.map((s) => <option key={s} value={s}>{BUG_STATUS_LABEL[s]}</option>)}
          </select>
          <button className="tmodal-x" onClick={() => void handleClose()} aria-label="Đóng">✕</button>
        </div>

        <input
          className="bug-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!canEdit}
          placeholder="Tiêu đề bug (vd: [2.0.11] [Dev] Lỗi hiển thị…)"
        />

        {isEdit && bug && (
          <p className="bug-meta muted">Tạo {formatDate(bug.createdAt)} bởi {bug.reporterName || '—'}</p>
        )}

        {/* Labels */}
        <div className="field">
          <span className="field-label">Nhãn</span>
          <div className="bug-label-picker">
            {labels.map((l) => (
              <BugLabelChip
                key={l.id}
                label={l}
                active={labelIds.includes(l.id)}
                onClick={canEdit ? () => toggleLabel(l.id) : undefined}
              />
            ))}
            {isAdmin && !showNewLabel && (
              <button type="button" className="bug-addlabel" onClick={() => setShowNewLabel(true)}>＋</button>
            )}
            {labels.length === 0 && !isAdmin && <span className="muted" style={{ fontSize: '0.8rem' }}>Chưa có nhãn.</span>}
          </div>
          {showNewLabel && (
            <div className="bug-newlabel">
              <input className="input" style={{ width: 56 }} value={newIcon} onChange={(e) => setNewIcon(e.target.value)} placeholder="🐞" maxLength={2} />
              <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tên nhãn" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLabel())} />
              <div className="bug-swatches">
                {SWATCHES.map((c) => (
                  <button key={c} type="button" className={`bug-swatch${newColor === c ? ' on' : ''}`} style={{ background: c }} onClick={() => setNewColor(c)} aria-label={c} />
                ))}
              </div>
              <button type="button" className="btn-sm" onClick={addLabel}>Thêm</button>
              <button type="button" className="btn-sm" onClick={() => setShowNewLabel(false)}>Huỷ</button>
            </div>
          )}
        </div>

        <label className="field">
          <span>Người nhận</span>
          <select className="select" value={assigneeId ?? ''} onChange={(e) => setAssigneeId(e.target.value || null)} disabled={!canEdit}>
            <option value="">Chưa giao</option>
            {members.map((m) => <option key={m.uid} value={m.uid}>{m.displayName}</option>)}
          </select>
        </label>

        <label className="field">
          <span>Mô tả</span>
          <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canEdit} placeholder="Các bước tái hiện, kết quả mong đợi / thực tế…" />
        </label>

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          {canDelete && <button className="btn-sm btn-danger" onClick={handleDelete}>🗑 Xoá</button>}
          <div style={{ flex: 1 }} />
          {isEdit ? (
            canEdit && <span className={`tm-savehint tm-save-${saveState}`}>{saveHint}</span>
          ) : (
            <button className="btn-primary" onClick={handleCreate} disabled={creating}>{creating ? 'Đang tạo…' : 'Tạo bug'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
