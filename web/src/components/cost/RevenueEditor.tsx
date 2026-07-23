import { useState } from 'react';
import { formatVnd } from '../../lib/format';
import { monthLabel, type CostSeries } from '../../lib/projectCost';
import MoneyInput from './MoneyInput';

interface Props {
  series: CostSeries;
  /** Doanh thu hiệu lực từng tháng (server + ghi lạc quan) — nguồn hiển thị của ô nhập. */
  revenueByMonth: Map<number, number>;
  onCommit: (monthIdx: number, amount: number) => void;
  /** Ghi nhiều tháng một lượt (chế độ "chia đều") — một cú upsert. */
  onCommitMany: (entries: { monthIdx: number; amount: number }[]) => void;
}

/**
 * Doanh thu DỰ KIẾN — hai cách điền (tab nhỏ):
 * - "Theo tháng": sửa từng ô như bảng tính (ghi lạc quan, chart đổi ngay).
 * - "Chia đều":   điền MỘT CỤC cho cả khoảng rồi chia đều ra từng tháng (tháng đầu nhận
 *                 phần dư làm tròn để tổng khớp tuyệt đối). GHI ĐÈ mọi ô trong khoảng.
 */
export default function RevenueEditor({ series, revenueByMonth, onCommit, onCommitMany }: Props) {
  const [mode, setMode] = useState<'monthly' | 'lump'>('monthly');
  // Mặc định = tổng hiện tại, để mở tab là thấy ngay con số đang có rồi sửa.
  const [lump, setLump] = useState(() => series.totals.revenue);

  const n = series.monthsIdx.length;

  function distribute() {
    if (n === 0) return;
    const per = Math.floor(lump / n);
    const first = lump - per * (n - 1); // dư làm tròn dồn vào tháng đầu — tổng khớp 100%
    onCommitMany(series.monthsIdx.map((m, i) => ({ monthIdx: m, amount: i === 0 ? first : per })));
  }

  return (
    <div className="glass section" style={{ padding: '1.25rem' }}>
      <div className="row between cost-section-head">
        <div>
          <h3>💹 Doanh thu dự kiến theo tháng</h3>
          <p className="muted cost-section-sub">
            Tổng trong khoảng đang xem: <strong className="mono">{formatVnd(series.totals.revenue)}</strong>.
          </p>
        </div>
        <div className="seg-toggle">
          <button className={`seg${mode === 'monthly' ? ' on' : ''}`} onClick={() => setMode('monthly')}>Theo tháng</button>
          <button className={`seg${mode === 'lump' ? ' on' : ''}`} onClick={() => setMode('lump')}>Chia đều</button>
        </div>
      </div>

      {mode === 'monthly' && (
        <div className="rev-grid">
          {series.monthsIdx.map((m) => (
            <label key={m} className="field rev-cell">
              <span className="mono">{monthLabel(m)}</span>
              <MoneyInput
                value={revenueByMonth.get(m) ?? 0}
                onCommit={(v) => onCommit(m, v)}
                className="cost-money-block"
                ariaLabel={`Doanh thu tháng ${monthLabel(m)}`}
              />
            </label>
          ))}
        </div>
      )}

      {mode === 'lump' && (
        <div className="rev-lump">
          <label className="field rev-lump-input">
            <span>Tổng doanh thu cả khoảng ({n} tháng)</span>
            <MoneyInput value={lump} onCommit={setLump} className="cost-money-block" ariaLabel="Tổng doanh thu cả khoảng" />
          </label>
          <button className="btn-primary" onClick={distribute} disabled={n === 0}>
            Chia đều cho {n} tháng
          </button>
          <span className="muted rev-lump-note">
            ≈ <span className="mono">{formatVnd(n > 0 ? lump / n : 0)}</span> / tháng.
            Bấm nút sẽ <strong>ghi đè toàn bộ</strong> các ô tháng trong khoảng đang xem
            ({monthLabel(series.monthsIdx[0] ?? 0)} → {monthLabel(series.monthsIdx[n - 1] ?? 0)}).
          </span>
        </div>
      )}
    </div>
  );
}
