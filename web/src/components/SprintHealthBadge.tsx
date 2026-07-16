import type { CSSProperties } from 'react';
import type { SprintHealth, SprintHealthKey } from '../lib/sprint';

interface HealthMeta {
  label: string;
  icon: string;
  color: string;
}

const HEALTH_META: Record<SprintHealthKey, HealthMeta> = {
  unknown: { label: 'Chưa đủ dữ liệu', icon: '❔', color: 'var(--muted)' },
  not_started: { label: 'Chưa bắt đầu', icon: '🕒', color: 'var(--muted)' },
  done: { label: 'Đã xong', icon: '🎉', color: 'var(--green)' },
  ahead: { label: 'Vượt tiến độ', icon: '🚀', color: 'var(--green)' },
  on_track: { label: 'Đúng tiến độ', icon: '✅', color: 'var(--sky)' },
  at_risk: { label: 'Có rủi ro', icon: '⚠️', color: 'var(--amber)' },
  behind: { label: 'Chậm tiến độ', icon: '🔥', color: 'var(--red)' },
};

/** Câu giải thích ngắn: vì sao sprint đang ở trạng thái này. */
export function describeHealth(health: SprintHealth): string {
  const { key, remaining, ideal, variance, percentElapsed } = health;
  if (key === 'unknown') return 'Cần sprint có ngày bắt đầu/kết thúc và ít nhất một task.';
  if (key === 'not_started') return `Sprint chưa chạy · ${remaining} task đang chờ.`;
  if (key === 'done') return `Đã xong toàn bộ task · đã trôi ${percentElapsed}% thời gian.`;

  const gap =
    variance > 0
      ? `sớm hơn kế hoạch ${variance} task`
      : variance < 0
        ? `chậm hơn kế hoạch ${-variance} task`
        : 'bám sát kế hoạch';
  return `Còn ${remaining} task, lý tưởng còn ${ideal} → ${gap} · đã trôi ${percentElapsed}% thời gian.`;
}

interface SprintHealthBadgeProps {
  health: SprintHealth;
  /** Kèm câu giải thích bên dưới thay vì chỉ hiện tooltip. */
  withDetail?: boolean;
}

/** Nhãn trạng thái sprint đọc từ đường burndown (xem `sprintHealth`). */
export default function SprintHealthBadge({ health, withDetail = false }: SprintHealthBadgeProps) {
  const meta = HEALTH_META[health.key];
  const detail = describeHealth(health);

  return (
    <div className="health-wrap">
      <span
        className="health-badge"
        style={{ '--c': meta.color } as CSSProperties}
        title={withDetail ? undefined : detail}
      >
        <span className="health-icon">{meta.icon}</span>
        {meta.label}
      </span>
      {withDetail && <p className="health-detail">{detail}</p>}
    </div>
  );
}
