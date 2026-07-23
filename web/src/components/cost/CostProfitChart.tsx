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
  type ScriptableContext,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { CHART_GRID, applyChartTheme } from '../../lib/chartTheme';
import { formatVnd, shortVnd } from '../../lib/format';
import { monthLabel, type CostSeries } from '../../lib/projectCost';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Legend);
applyChartTheme();

/**
 * Biểu đồ LÃI/LỖ: cột từng tháng (xanh = lãi, đỏ = lỗ) + đường LŨY KẾ vàng — nhìn phát ra
 * tháng nào bắt đầu hoà vốn. Cùng series với thẻ tổng nên số luôn khớp.
 */
export default function CostProfitChart({ series }: { series: CostSeries }) {
  const labels = series.monthsIdx.map(monthLabel);
  // Lãi/lỗ THÁNG = doanh thu − tổng chi tháng đó; lũy kế = cộng dồn từ đầu khoảng.
  const monthly = series.monthsIdx.map(
    (_, i) =>
      series.revenue[i] -
      (series.salary[i] + series.tet[i] + series.insurance[i] + series.overhead[i] + series.projection[i]),
  );
  const cumulative: number[] = [];
  monthly.reduce((acc, v) => {
    const next = acc + v;
    cumulative.push(next);
    return next;
  }, 0);

  const data: ChartData<'bar' | 'line', number[], string> = {
    labels,
    datasets: [
      {
        type: 'line' as const,
        label: 'Lũy kế',
        data: cumulative,
        borderColor: '#fbbf24',
        backgroundColor: '#fbbf24',
        tension: 0.3,
        pointRadius: 3,
      },
      {
        type: 'bar' as const,
        label: 'Lãi/Lỗ tháng',
        data: monthly,
        // Màu theo DẤU từng cột: xanh lãi, đỏ lỗ.
        backgroundColor: (ctx: ScriptableContext<'bar'>) =>
          Number(ctx.raw ?? 0) >= 0 ? 'rgba(34, 197, 94, 0.75)' : 'rgba(239, 68, 68, 0.75)',
      },
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
      x: { grid: { color: CHART_GRID } },
      y: {
        grid: {
          // Vạch 0 đậm hơn hẳn — ranh giới lãi/lỗ phải nhìn thấy ngay.
          color: (ctx) => (ctx.tick.value === 0 ? 'rgba(255, 255, 255, 0.35)' : CHART_GRID),
        },
        ticks: { callback: (v) => shortVnd(Number(v)) },
      },
    },
  };

  return (
    <div className="glass section" style={{ padding: '1.25rem' }}>
      <div className="cost-section-head">
        <h3>📈 Lãi / Lỗ theo tháng</h3>
        <p className="muted cost-section-sub">
          Cột = lãi/lỗ của từng tháng (doanh thu − tổng chi); đường vàng = lũy kế từ đầu khoảng —
          cắt vạch 0 ở đâu là hoà vốn ở đó.
        </p>
      </div>
      <div className="cost-chart-wrap">
        <Chart type="bar" data={data} options={options} />
      </div>
    </div>
  );
}
