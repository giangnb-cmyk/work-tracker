import { useMemo } from 'react';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { applyChartTheme, CHART_GRID, CHART_MUTED, CHART_SURFACE } from '../../lib/chartTheme';
import { foldSeries } from '../../lib/perfPalette';
import type { TrendSeries } from '../../lib/performance';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);
// Canvas không ăn CSS: nếu không ép, legend/nhãn trục sẽ vẽ bằng Helvetica mặc định của
// Chart.js, lệch hẳn khỏi font của app.
applyChartTheme();

interface DoneTrendChartProps {
  trend: TrendSeries;
  colorByUid: Map<string, string>;
}

/**
 * Bar chồng: mỗi cột là một sprint, mỗi segment là một người.
 *
 * Cố ý KHÔNG dùng line một đường/người: 10 người là 10 đường rối. Cũng không sinh màu
 * theo hash uid — người thứ 9 trở đi gộp vào "Khác" (xem lib/perfPalette.ts).
 */
export default function DoneTrendChart({ trend, colorByUid }: DoneTrendChartProps) {
  const datasets = useMemo(() => foldSeries(trend.datasets, colorByUid), [trend.datasets, colorByUid]);

  if (trend.labels.length === 0 || datasets.length === 0) {
    return (
      <div className="glass section" style={{ padding: '1.5rem' }}>
        <h3>Task đã xong theo sprint</h3>
        <div className="empty">Chưa có task nào hoàn thành trong khoảng này.</div>
      </div>
    );
  }

  return (
    <div className="glass section" style={{ padding: '1.5rem' }}>
      {/* Tiêu đề nói rõ cách tính: đây KHÁC với "task hoàn thành trong cửa sổ thời gian
          của sprint đó" — một task xong ở sprint sau sẽ đứng ở cột sprint sau. */}
      <h3>Task đã xong theo sprint</h3>
      <p className="muted" style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>
        Tính theo sprint task đang thuộc về, khớp với bảng "Theo sprint" ở trên.
      </p>
      {/* Chiều cao gồm cả dải nhãn trục x, nếu không thẻ sẽ đẻ ra thanh cuộn dọc tí hon. */}
      <div style={{ height: 320, position: 'relative' }}>
        <Bar
          data={{
            labels: trend.labels,
            datasets: datasets.map((s) => ({
              label: s.name,
              data: s.data,
              backgroundColor: s.color,
              // Viền màu NỀN = khe hở 2px giữa các segment, không phải "kẻ viền cho tách nhau".
              borderColor: CHART_SURFACE,
              borderWidth: 2,
              borderSkipped: false,
              borderRadius: 4,
            })),
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { position: 'bottom', labels: { color: CHART_MUTED, boxWidth: 12, boxHeight: 12 } },
              tooltip: { itemSort: (a, b) => (b.raw as number) - (a.raw as number) },
            },
            scales: {
              x: { stacked: true, ticks: { color: CHART_MUTED }, grid: { display: false } },
              y: {
                stacked: true,
                beginAtZero: true,
                ticks: { color: CHART_MUTED, precision: 0 },
                grid: { color: CHART_GRID },
              },
            },
          }}
        />
      </div>
    </div>
  );
}
