import { useMemo } from 'react';
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type Plugin,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { appFontFamily, applyChartTheme, CHART_GRID, CHART_MUTED } from '../../lib/chartTheme';
import { buildBurnup } from '../../lib/burnup';
import { formatIsoDate } from '../../lib/format';
import { fmtQty, type VelocityPlan } from '../../lib/velocity';
import type { VelocityChart, VelocityProgress } from '../../types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);
// Canvas không ăn CSS — ép font của app cho nhãn trục (xem lib/chartTheme).
applyChartTheme();

interface Props {
  chart: VelocityChart;
  plan: VelocityPlan;
  entries: VelocityProgress[];
  holidaySet: ReadonlySet<string>;
  today: string;
}

// Palette theo design system: tiến độ = indigo sáng, nhịp cần = gold, mốc = sky, deadline = red.
const ACTUAL = '#818cf8';
const REQUIRED = '#fbbf24';
const OFF_BAND = 'rgba(56, 189, 248, 0.12)';
const AIM_LINE = '#38bdf8';
const DEADLINE_LINE = '#ef4444';
const TEXT = '#f8fafc';
const LABEL_BG = 'rgba(15, 23, 42, 0.88)';

/** "24/8" — ngắn cho trục x và nhãn điểm. */
function shortDay(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}/${m}`;
}

/** Hộp bo góc — canvas cũ không có ctx.roundRect. */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Burn-up của một chart, dựng theo đúng bản đội đang dùng (matplotlib):
 *   • title tên chart ở giữa; legend đóng khung ở góc trên trái TRONG vùng vẽ;
 *   • MỘT đường liền "tiến độ hiện tại": tiến độ thật tới hôm nay (chấm ở ngày có dữ liệu,
 *     nhãn "12 tại 24/8"), nối tiếp bằng dự kiến nếu giữ tốc độ hiện tại;
 *   • đường đứt vàng "cần để xong <mốc>": phẳng ở mức đã làm, tăng đều tới mốc, phẳng qua nghỉ;
 *   • nền sky nhạt = kỳ nghỉ có lễ; vạch chấm = mốc cần xong; vạch gạch-chấm đỏ = deadline;
 *   • trục x "Ngày" nhãn 4 ngày một, trục y "<đơn vị> đã xong".
 * Dải/vạch vẽ bằng plugin canvas (Chart.js không có annotation sẵn, không thêm dependency);
 * legend là HTML đặt tuyệt đối để đóng khung và gom đủ cả dải/vạch — legend gốc của Chart.js
 * chỉ biết dataset.
 */
export default function BurnupChart({ chart, plan, entries, holidaySet, today }: Props) {
  const series = useMemo(() => buildBurnup(chart, plan, entries, holidaySet, today), [chart, plan, entries, holidaySet, today]);
  const n = series.days.length;
  // Như bản gốc: 4 ngày một nhãn; chart quá dài thì thưa hơn cho đủ chỗ.
  const tickStep = n <= 44 ? 4 : Math.ceil(n / 11);

  // Một đường: thật tới hôm nay, dự kiến sau đó.
  const progress = useMemo(() => {
    const t = series.todayIdx;
    return series.days.map((_, i) => (t === null || i <= t ? series.actual[i] : series.projected[i]));
  }, [series]);
  const pointRadius = useMemo(() => {
    const set = new Set(series.loggedIdx);
    if (series.todayIdx !== null) set.add(series.todayIdx);
    return series.days.map((_, i) => (set.has(i) ? 3.5 : 0));
  }, [series]);

  const overlay = useMemo<Plugin<'line'>>(
    () => ({
      id: 'burnupOverlay',
      beforeDatasetsDraw(c) {
        const { ctx, chartArea, scales } = c;
        const x = scales.x;
        if (!x || n === 0) return;
        const half = n > 1 ? (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2 : 0;
        ctx.save();
        ctx.fillStyle = OFF_BAND;
        for (const r of series.offRuns) {
          const x0 = x.getPixelForValue(r.from) - half;
          const x1 = x.getPixelForValue(r.to) + half;
          ctx.fillRect(x0, chartArea.top, x1 - x0, chartArea.bottom - chartArea.top);
        }
        const vline = (i: number, color: string, dash: number[]) => {
          const px = x.getPixelForValue(i);
          ctx.beginPath();
          ctx.setLineDash(dash);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.moveTo(px, chartArea.top);
          ctx.lineTo(px, chartArea.bottom);
          ctx.stroke();
        };
        if (series.aimIdx !== null) vline(series.aimIdx, AIM_LINE, [2, 3]);
        vline(series.deadlineIdx, DEADLINE_LINE, [8, 3, 2, 3]);
        ctx.restore();
      },
      afterDatasetsDraw(c) {
        // "12 tại 24/8" cạnh điểm hôm nay, nền tối để không lẫn vào đường; hết chỗ thì xuống dưới.
        if (series.todayIdx === null) return;
        const el = c.getDatasetMeta(0).data[series.todayIdx];
        if (!el) return;
        const { ctx, chartArea } = c;
        const text = `${fmtQty(chart.doneQty)} tại ${shortDay(today)}`;
        ctx.save();
        ctx.font = `600 11px ${appFontFamily()}`;
        const w = ctx.measureText(text).width + 12;
        const h = 20;
        const bx = Math.min(Math.max(el.x + 8, chartArea.left), chartArea.right - w);
        let by = el.y - h - 6;
        if (by < chartArea.top) by = el.y + 8;
        ctx.fillStyle = LABEL_BG;
        roundRect(ctx, bx, by, w, h, 6);
        ctx.fill();
        ctx.fillStyle = TEXT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, bx + w / 2, by + h / 2);
        ctx.restore();
      },
    }),
    [series, n, chart.doneQty, today],
  );

  if (n === 0) return <div className="empty">Chưa có khoảng ngày để vẽ.</div>;

  const aimLabel = formatIsoDate(plan.aimDate).slice(0, 5);
  const deadlineLabel = formatIsoDate(chart.endDate).slice(0, 5);
  return (
    <div>
      <div className="burnup-title">{chart.name}</div>
      <div className="burnup-wrap">
        {/* Legend đóng khung góc trên trái, trong vùng vẽ — như bản matplotlib của đội. */}
        <div className="burnup-legend-box" aria-label="Chú giải">
          <span><i className="gantt-lg burnup-lg-line" /> Tiến độ hiện tại (~{fmtQty(plan.currentVelocity)} {chart.unit}/ngày)</span>
          <span>
            <i className="gantt-lg burnup-lg-req" /> Tiến độ cần để xong {aimLabel}
            {' '}(~{plan.requiredPerDay === null ? '∞' : fmtQty(plan.requiredPerDay)}/ngày)
          </span>
          {series.offRuns.length > 0 && <span><i className="gantt-lg burnup-lg-off" /> Nghỉ lễ</span>}
          {series.aimIdx !== null && <span><i className="gantt-lg burnup-lg-aim" /> Mốc cần xong: {aimLabel}</span>}
          <span><i className="gantt-lg burnup-lg-deadline" /> Deadline: {deadlineLabel}</span>
        </div>
        <Line
          plugins={[overlay]}
          data={{
            labels: series.days,
            datasets: [
              {
                label: 'Tiến độ',
                data: progress,
                borderColor: ACTUAL,
                backgroundColor: ACTUAL,
                borderWidth: 2,
                pointRadius,
                pointHoverRadius: 5,
                spanGaps: true,
                tension: 0,
              },
              {
                label: `Cần để xong ${aimLabel}`,
                data: series.required,
                borderColor: REQUIRED,
                borderDash: [8, 4],
                borderWidth: 2,
                pointRadius: 0,
                spanGaps: true,
                tension: 0,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            layout: { padding: { top: 6, right: 8 } },
            plugins: {
              legend: { display: false },
              tooltip: {
                filter: (item) => item.raw !== null && item.raw !== undefined,
                callbacks: {
                  title: (items) => (items[0] ? formatIsoDate(series.days[items[0].dataIndex]) : ''),
                  label: (item) => `${item.dataset.label}: ${fmtQty(item.raw as number)} ${chart.unit}`,
                },
              },
            },
            scales: {
              x: {
                grid: { display: false },
                title: { display: true, text: 'Ngày', color: CHART_MUTED },
                ticks: {
                  color: CHART_MUTED,
                  autoSkip: false,
                  maxRotation: 0,
                  callback: (_v, i) => (i % tickStep === 0 ? shortDay(series.days[i]) : ''),
                },
              },
              y: {
                beginAtZero: true,
                suggestedMax: chart.totalQty > 0 ? chart.totalQty * 1.06 : undefined,
                ticks: { color: CHART_MUTED },
                grid: { color: CHART_GRID },
                title: { display: true, text: `${chart.unit} đã xong`, color: CHART_MUTED },
              },
            },
          }}
        />
      </div>
    </div>
  );
}
