import { useMemo, useState } from 'react';
import { useSprintContext } from '../../contexts/SprintContext';
import { moveTaskToSprint } from '../../lib/taskWrites';
import { sortSprintsChronologically } from '../../lib/sprintRange';
import { formatDateRange } from '../../lib/format';
import SearchableSelect from '../SearchableSelect';
import type { Task } from '../../types';

interface MoveSprintModalProps {
  task: Task;
  onClose: () => void;
}

/** Chuyển task dở dang sang sprint khác; sprint cũ vẫn giữ lịch sử (xem `moveTaskToSprint`). */
export default function MoveSprintModal({ task, onClose }: MoveSprintModalProps) {
  const { sprints } = useSprintContext();
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(
    () =>
      sortSprintsChronologically(sprints)
        .filter((s) => s.id !== task.sprintId)
        .map((s) => ({ value: s.id, label: `${s.name} · ${formatDateRange(s.startDate, s.endDate)}` })),
    [sprints, task.sprintId],
  );

  async function handleMove() {
    if (!target) return;
    const targetSprint = sprints.find((s) => s.id === target);
    if (!targetSprint) return;
    setSaving(true);
    setError(null);
    try {
      await moveTaskToSprint(task, targetSprint);
      onClose();
    } catch (err) {
      console.error('Chuyển sprint thất bại', err);
      setError('Chuyển thất bại. Cần quyền admin hoặc là người nhận/tạo task.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Chuyển sang sprint khác</h2>
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
          <strong>{task.title}</strong> sẽ được sprint mới làm tiếp. Sprint hiện tại vẫn lưu task
          này để đếm nó đã trễ mấy sprint.
        </p>

        <label className="field">
          <span>Sprint đích *</span>
          <SearchableSelect
            value={target}
            onChange={setTarget}
            options={options}
            placeholder="Chọn sprint…"
          />
        </label>

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          <button className="btn-sm" onClick={onClose} disabled={saving}>Huỷ</button>
          <button className="btn-primary" onClick={handleMove} disabled={saving || !target}>
            {saving ? 'Đang chuyển…' : 'Chuyển'}
          </button>
        </div>
      </div>
    </div>
  );
}
