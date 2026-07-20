import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useRoute } from '../lib/router';
import { BACKLOG_COUNT_KEY, useMyOpenTaskCounts } from '../hooks/useMyOpenTaskCounts';
import NotificationBell from './NotificationBell';
import { sprintPhase, type SprintPhase } from '../lib/sprintRange';

// Badge suy từ NGÀY (sprintPhase), không từ cột status — sprint tuần tự tạo không ai bấm
// 'active' tay mà mốc thời gian mới là sự thật (xem activeSprintAt / migration 0041).
const PHASE_LABEL: Record<SprintPhase, string> = {
  running: 'Đang chạy',
  upcoming: 'Sắp tới',
  finished: 'Hoàn thành',
  unknown: 'Chưa đặt ngày',
};
// Dùng lại màu badge status-* cũ: running≈active, finished≈completed, còn lại≈planning.
const PHASE_STATUS_CLASS: Record<SprintPhase, string> = {
  running: 'active',
  upcoming: 'planning',
  finished: 'completed',
  unknown: 'planning',
};

/** Sticky top bar: sprint context selector + notifications. Task creation now
 *  lives on the "+" card at the top of each task list. */
export default function TopBar() {
  const { user } = useAuth();
  const { sprints, selectedSprintId, selectedSprint, selectSprint } = useSprintContext();
  // Badge số chỉ có nghĩa ở "Task của tôi" — dropdown này dùng chung mọi view, ở tab khác
  // con số task cá nhân sẽ lạc chỗ. `enabled` cũng tắt luôn subscription ở view khác.
  const onMyTasks = useRoute().view === 'mytasks';
  const openCounts = useMyOpenTaskCounts(user?.uid ?? '', onMyTasks);
  // <option> gốc chỉ nhận text thường (không gắn được badge màu) → chèn " (n)".
  const suffix = (key: string) => {
    if (!onMyTasks) return '';
    const n = openCounts.get(key) ?? 0;
    return n > 0 ? ` (${n})` : '';
  };

  return (
    <header className="topbar">
      <div className="row" style={{ gap: '0.75rem' }}>
        <select
          className="select"
          style={{ width: 'auto', minWidth: 180 }}
          value={selectedSprintId ?? 'backlog'}
          onChange={(e) => selectSprint(e.target.value === 'backlog' ? null : e.target.value)}
        >
          <option value="backlog">📥 Backlog (chưa vào sprint){suffix(BACKLOG_COUNT_KEY)}</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}{suffix(s.id)}
            </option>
          ))}
        </select>
        {selectedSprint && (() => {
          const phase = sprintPhase(selectedSprint, Date.now());
          return (
            <span className={`badge status-${PHASE_STATUS_CLASS[phase]}`}>{PHASE_LABEL[phase]}</span>
          );
        })()}
      </div>

      <div className="row" style={{ gap: '0.75rem', alignItems: 'center' }}>
        <NotificationBell />
      </div>
    </header>
  );
}
