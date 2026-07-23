import { formatVnd } from '../../lib/format';
import type { CostSeries } from '../../lib/projectCost';

interface Card {
  icon: string;
  label: string;
  value: string;
  /** Lớp phụ cho thẻ nổi bật: 'total' (indigo) | 'profit' | 'loss'. */
  tone?: 'total' | 'profit' | 'loss';
}

/**
 * Dải thẻ tổng hợp của tab Chi phí — đọc thẳng từ series theo tháng (buildCostSeries) nên
 * luôn khớp biểu đồ. Số NGƯỜI không nằm ở đây — hiện ở đầu bảng "Chi phí nhân sự".
 */
export default function CostSummary({ months, totals }: { months: number; totals: CostSeries['totals'] }) {
  const span = `${months} tháng`;
  const cards: Card[] = [
    { icon: '💵', label: `Tổng lương · ${span}`, value: formatVnd(totals.salary) },
    { icon: '🧧', label: 'Thưởng Tết', value: formatVnd(totals.tet) },
    { icon: '🖥️', label: 'Chi phí ban đầu (1 lần)', value: formatVnd(totals.oneTime) },
    { icon: '🔌', label: `Chi phí vận hành · ${span}`, value: formatVnd(totals.recurring) },
    { icon: '🔮', label: `Dự chi · ${span}`, value: formatVnd(totals.projection) },
    { icon: '💰', label: `TỔNG CHI · ${span}`, value: formatVnd(totals.grand), tone: 'total' },
    { icon: '💹', label: `Doanh thu dự kiến · ${span}`, value: formatVnd(totals.revenue) },
    {
      icon: totals.profit >= 0 ? '📈' : '📉',
      label: `Lãi / Lỗ · ${span}`,
      value: formatVnd(totals.profit),
      tone: totals.profit >= 0 ? 'profit' : 'loss',
    },
  ];

  return (
    <div className="stats-row cost-summary">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`glass stat-card cost-stat${c.tone === 'total' ? ' cost-stat-total' : ''}${c.tone === 'profit' ? ' cost-stat-profit' : ''}${c.tone === 'loss' ? ' cost-stat-loss' : ''}`}
        >
          <span className="stat-icon">{c.icon}</span>
          <span className="stat-info">
            <span className="stat-value cost-stat-value">{c.value}</span>
            <span className="stat-label">{c.label}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
