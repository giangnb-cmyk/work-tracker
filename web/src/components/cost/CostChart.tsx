import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { CHART_GRID, applyChartTheme } from '../../lib/chartTheme';
import { formatVnd } from '../../lib/format';
import { monthLabel, type CostSeries } from '../../lib/projectCost';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Legend);
applyChartTheme();

/** Rút gọn tiền cho trục Y: 1.500.000.000 → "1,5 tỷ", 25.000.000 → "25tr". */
function shortVnd(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
  if (abs >= 1e6) return `${Math.round(v / 1e6)}tr`;
  return v.toLocaleString('vi-VN');
}

/**
 * Biểu đồ chi phí ↔ doanh thu QUA CÁC THÁNG trong cửa sổ slider: cột chồng = 4 bucket chi
 * (lương / thưởng Tết / TB&VH / dự chi), đường xanh = doanh thu dự kiến. Cùng series với
 * thẻ tổng (buildCostSeries) nên số hai nơi luôn khớp nhau.
 */
export default function CostChart({ series }: { series: CostSeries }) {
  const labels = series.monthsIdx.map(monthLabel);

  const data: ChartData<'bar' | 'line', number[], string> = {
    labels,
    datasets: [
      {
        type: 'line' as const,
        label: 'Doanh thu',
        data: series.revenue,
        borderColor: '#22c55e',
        backgroundColor: '#22c55e',
        tension: 0.3,
        pointRadius: 3,
      },
      { type: 'bar' as const, label: 'Lương', data: series.salary, backgroundColor: '#6366f1', stack: 'chi' },
      { type: 'bar' as const, label: 'Thưởng Tết', data: series.tet, backgroundColor: '#fbbf24', stack: 'chi' },
      { type: 'bar' as const, label: 'TB & VH', data: series.overhead, backgroundColor: '#38bdf8', stack: 'chi' },
      { type: 'bar' as const, label: 'Dự chi', data: series.projection, backgroundColor: '#c084fc', stack: 'chi' },
    ],
  };

  const options: ChartOptions<'bar' | 'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top' },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${formatVnd(Number(ctx.parsed.y ?? 0))}`,
        },
      },
    },
    scales: {
      x: { stacked: true, grid: { color: CHART_GRID } },
      y: {
        stacked: true,
        grid: { color: CHART_GRID },
        ticks: { callback: (v) => shortVnd(Number(v)) },
      },
    },
  };

  return (
    <div className="glass section" style={{ padding: '1.25rem' }}>
      <div className="cost-section-head">
        <h3>📊 Chi phí ↔ Doanh thu theo tháng</h3>
        <p className="muted cost-section-sub">
          Cột chồng = tổng CHI của tháng (lương + thưởng Tết + TB&amp;VH + dự chi); đường xanh = doanh thu dự kiến.
        </p>
      </div>
      <div className="cost-chart-wrap">
        <Chart type="bar" data={data} options={options} />
      </div>
    </div>
  );
}
