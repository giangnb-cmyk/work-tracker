import { useState } from 'react';
import { Timestamp } from '../lib/time';
import DateInput from './DateInput';
import type { Sprint } from '../types';

interface SprintEditModalProps {
  sprint: Sprint;
  /** Lưu patch (đã map sang kiểu Sprint) — SprintManager nối vào updateSprint(id, patch). */
  onSave: (patch: Partial<Sprint>) => Promise<void>;
  onClose: () => void;
}

/**
 * Sửa tên / mục tiêu / ngày của một sprint. Trạng thái vẫn đổi nhanh ở dropdown ngoài bảng
 * nên không nhắc lại ở đây. Ngày lưu về mốc UTC-midnight y như lúc TẠO (`new Date('YYYY-MM-DD')`)
 * để giá trị ô date khớp lại khi mở sửa lần sau.
 */
export default function SprintEditModal({ sprint, onSave, onClose }: SprintEditModalProps) {
  const toDateInput = (ts: Timestamp | null): string => (ts ? ts.toISOString().slice(0, 10) : '');

  const [name, setName] = useState(sprint.name);
  const [goal, setGoal] = useState(sprint.goal);
  const [start, setStart] = useState(toDateInput(sprint.startDate));
  const [end, setEnd] = useState(toDateInput(sprint.endDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        goal: goal.trim(),
        startDate: start ? Timestamp.fromDate(new Date(start)) : null,
        endDate: end ? Timestamp.fromDate(new Date(end)) : null,
      });
      onClose();
    } catch (err) {
      console.error('Sửa sprint thất bại', err);
      setError('Lưu thất bại (cần quyền admin).');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Sửa sprint</h2>
        <div className="grid-2">
          <label className="field">
            <span>Tên sprint *</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
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

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          <button className="btn-sm" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}
