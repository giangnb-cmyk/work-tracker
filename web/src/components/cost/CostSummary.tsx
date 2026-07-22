import { formatVnd } from '../../lib/format';

interface Props {
  headcount: number;
  months: number;
  salary: number;
  oneTime: number;
  annual: number;
  projection: number;
}

interface Card {
  icon: string;
  label: string;
  value: string;
  highlight?: boolean;
}

/** Dải thẻ tổng hợp của tab Chi phí. `grandTotal` = lương + ban đầu + vận hành + dự chi. */
export default function CostSummary({ headcount, months, salary, oneTime, annual, projection }: Props) {
  const grandTotal = salary + oneTime + annual + projection;
  const span = `${months} tháng`;

  const cards: Card[] = [
    { icon: '👥', label: 'Nhân sự', value: `${headcount} người` },
    { icon: '💵', label: `Tổng lương · ${span}`, value: formatVnd(salary) },
    { icon: '🖥️', label: 'Chi phí ban đầu (1 lần)', value: formatVnd(oneTime) },
    { icon: '🔌', label: `Chi phí vận hành · ${span}`, value: formatVnd(annual) },
    { icon: '🔮', label: `Dự chi · ${span}`, value: formatVnd(projection) },
    { icon: '💰', label: `TỔNG CỘNG · ${span}`, value: formatVnd(grandTotal), highlight: true },
  ];

  return (
    <div className="stats-row cost-summary">
      {cards.map((c) => (
        <div key={c.label} className={`glass stat-card cost-stat${c.highlight ? ' cost-stat-total' : ''}`}>
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
