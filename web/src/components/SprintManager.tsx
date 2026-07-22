import { useState } from 'react';
import { useSprintContext } from '../contexts/SprintContext';
import ConfirmDialog from './ConfirmDialog';
import DateInput from './DateInput';
import SprintEditModal from './SprintEditModal';
import { formatDate } from '../lib/format';
import type { Sprint, SprintStatus } from '../types';

const SPRINT_STATUSES: SprintStatus[] = ['planning', 'active', 'completed'];
const SPRINT_STATUS_LABEL: Record<SprintStatus, string> = {
  planning: 'Chuẩn bị',
  active: 'Đang chạy',
  completed: 'Hoàn thành',
};

/** Admin-only: create sprints and manage their lifecycle. */
export default function SprintManager() {
  const { sprints, createSprint, updateSprint, setSprintStatus, deleteSprint } = useSprintContext();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Sprint | null>(null);
  const [removing, setRemoving] = useState<Sprint | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(sprint: Sprint) {
    try {
      await deleteSprint(sprint.id);
      setRemoving(null);
    } catch (err) {
      console.error('Xoá sprint thất bại', err);
      setRemoving(null);
      setError('Xoá sprint thất bại (cần quyền admin).');
    }
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createSprint({
        name,
        goal,
        startDate: start ? new Date(start) : null,
        endDate: end ? new Date(end) : null,
      });
      setName('');
      setGoal('');
      setStart('');
      setEnd('');
      setError(null);
    } catch (err) {
      console.error('Tạo sprint thất bại', err);
      setError('Tạo sprint thất bại (cần quyền admin).');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fade-in">
      <div className="view-header">
        <h1>Quản lý Sprint</h1>
        <p>Tạo sprint mới và điều chỉnh trạng thái. Nên chỉ để một sprint "Đang chạy".</p>
      </div>

      <div className="glass section" style={{ padding: '1.5rem' }}>
        <h3>Tạo sprint</h3>
        <div className="grid-2">
          <label className="field">
            <span>Tên sprint *</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sprint 12" />
          </label>
          <label className="field">
            <span>Mục tiêu</span>
            <input className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Ra mắt tính năng X" />
          </label>
          <label className="field">
            <span>Bắt đầu</span>
            <DateInput value={start} onChange={setStart} ariaLabel="Ngày bắt đầu sprint" />
          </label>
          <label className="field">
            <span>Kết thúc</span>
            <DateInput value={end} onChange={setEnd} ariaLabel="Ngày kết thúc sprint" />
          </label>
        </div>
        <button className="btn-primary" onClick={handleCreate} disabled={saving || !name.trim()}>
          {saving ? 'Đang tạo…' : '+ Tạo sprint'}
        </button>
      </div>

      <div className="glass table-container section" style={{ padding: '0.5rem' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Sprint</th>
              <th>Mục tiêu</th>
              <th>Thời gian</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sprints.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td className="muted">{s.goal || '—'}</td>
                <td className="muted mono" style={{ fontSize: '0.78rem' }}>
                  {formatDate(s.startDate)} → {formatDate(s.endDate)}
                </td>
                <td>
                  <select
                    className="select"
                    style={{ width: 'auto', padding: '0.3rem 0.5rem' }}
                    value={s.status}
                    onChange={(e) => setSprintStatus(s.id, e.target.value as SprintStatus)}
                  >
                    {SPRINT_STATUSES.map((st) => (
                      <option key={st} value={st}>{SPRINT_STATUS_LABEL[st]}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <div className="row-actions">
                    <button className="btn-sm" onClick={() => setEditing(s)}>Sửa</button>
                    <button className="btn-sm btn-danger" onClick={() => setRemoving(s)}>Xoá</button>
                  </div>
                </td>
              </tr>
            ))}
            {sprints.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">Chưa có sprint nào.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {error && <p className="error-text">{error}</p>}

      {editing && (
        <SprintEditModal
          sprint={editing}
          onSave={(patch) => updateSprint(editing.id, patch)}
          onClose={() => setEditing(null)}
        />
      )}

      {removing && (
        <ConfirmDialog
          title="Xoá sprint?"
          message={<>Sprint <strong>“{removing.name}”</strong> sẽ bị xoá.</>}
          detail="Task trong sprint KHÔNG bị xoá, chỉ mất liên kết sprint (task chưa giao ai sẽ rơi về Backlog). Sprint thì không khôi phục được."
          confirmLabel="Xoá sprint"
          onConfirm={() => handleDelete(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
