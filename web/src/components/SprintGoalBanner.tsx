import { CalendarIcon, TargetIcon } from './icons';
import SprintHealthBadge from './SprintHealthBadge';
import { formatDateRange } from '../lib/format';
import type { SprintHealth } from '../lib/sprint';
import type { Sprint } from '../types';

interface SprintGoalBannerProps {
  sprint: Sprint;
  health: SprintHealth | null;
  daysLeft: number | null;
}

function daysText(daysLeft: number | null): string | null {
  if (daysLeft === null) return null;
  if (daysLeft < 0) return `Quá hạn ${Math.abs(daysLeft)} ngày`;
  if (daysLeft === 0) return 'Hôm nay là ngày cuối';
  return `Còn ${daysLeft} ngày`;
}

/**
 * Mục tiêu sprint, đặt ngay đầu trang Thống kê — thứ cả đội cần thấy trước mọi con số.
 * Dùng treatment "nổi bật" của design system (gradient indigo + viền indigo, mục
 * Pacing/Metric Cards trong design_system_guide.md).
 */
export default function SprintGoalBanner({ sprint, health, daysLeft }: SprintGoalBannerProps) {
  const goal = sprint.goal?.trim();
  const days = daysText(daysLeft);

  return (
    <section className="goal-banner">
      <span className="goal-tile" aria-hidden>
        <TargetIcon size={24} />
      </span>

      <div className="goal-body">
        <span className="goal-label">Mục tiêu · {sprint.name}</span>
        {/* Nội dung, không phải tiêu đề mục → Inter đậm, không dùng font-head. */}
        {goal ? (
          <p className="goal-text">{goal}</p>
        ) : (
          <p className="goal-text goal-empty">
            Sprint này chưa đặt mục tiêu. Admin thêm ở tab “Quản lý Sprint”.
          </p>
        )}
        <div className="goal-meta">
          <span className="goal-when">
            <CalendarIcon size={14} />
            {formatDateRange(sprint.startDate, sprint.endDate)}
          </span>
          {days && <span className={`goal-days${daysLeft !== null && daysLeft < 0 ? ' overdue' : ''}`}>{days}</span>}
        </div>
      </div>

      {health && <SprintHealthBadge health={health} />}
    </section>
  );
}
