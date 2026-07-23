import { formatVnd } from '../../lib/format';
import { monthLabel, type CostSeries } from '../../lib/projectCost';
import MoneyInput from './MoneyInput';

interface Props {
  series: CostSeries;
  /** Doanh thu hiệu lực từng tháng (server + ghi lạc quan) — nguồn hiển thị của ô nhập. */
  revenueByMonth: Map<number, number>;
  onCommit: (monthIdx: number, amount: number) => void;
}

/**
 * Bảng điền DOANH THU DỰ KIẾN cho từng tháng trong cửa sổ đang xem. Ô nào cũng sửa-trên-ô
 * (ghi lạc quan) — gõ xong là đường doanh thu trên biểu đồ đổi ngay.
 */
export default function RevenueEditor({ series, revenueByMonth, onCommit }: Props) {
  return (
    <div className="glass section" style={{ padding: '1.25rem' }}>
      <div className="cost-section-head">
        <h3>💹 Doanh thu dự kiến theo tháng</h3>
        <p className="muted cost-section-sub">
          Điền cho từng tháng trong khoảng đang xem — tổng: <strong className="mono">{formatVnd(series.totals.revenue)}</strong>.
        </p>
      </div>
      <div className="rev-grid">
        {series.monthsIdx.map((m) => (
          <label key={m} className="field rev-cell">
            <span className="mono">{monthLabel(m)}</span>
            <MoneyInput
              value={revenueByMonth.get(m) ?? 0}
              onCommit={(n) => onCommit(m, n)}
              className="cost-money-block"
              ariaLabel={`Doanh thu tháng ${monthLabel(m)}`}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
