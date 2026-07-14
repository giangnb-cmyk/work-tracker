import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import type { SprintStatus } from '../types';

const SPRINT_STATUS_LABEL: Record<SprintStatus, string> = {
  planning: 'Chuẩn bị',
  active: 'Đang chạy',
  completed: 'Hoàn thành',
};

interface TopBarProps {
  onNewTask: () => void;
}

/** Sticky top bar: sprint context selector + primary action. */
export default function TopBar({ onNewTask }: TopBarProps) {
  const { isAdmin } = useAuth();
  const { sprints, selectedSprintId, selectedSprint, selectSprint } = useSprintContext();

  return (
    <header className="topbar">
      <div className="row" style={{ gap: '0.75rem' }}>
        <select
          className="select"
          style={{ width: 'auto', minWidth: 180 }}
          value={selectedSprintId ?? 'backlog'}
          onChange={(e) => selectSprint(e.target.value === 'backlog' ? null : e.target.value)}
        >
          <option value="backlog">📥 Backlog (chưa vào sprint)</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {selectedSprint && (
          <span className={`badge status-${selectedSprint.status}`}>
            {SPRINT_STATUS_LABEL[selectedSprint.status]}
          </span>
        )}
      </div>

      {isAdmin && (
        <button className="btn-primary" onClick={onNewTask}>
          + Task mới
        </button>
      )}
    </header>
  );
}
