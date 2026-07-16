// Theme dùng chung cho mọi biểu đồ Chart.js.
//
// Vì sao cần: Chart.js mặc định vẽ chữ bằng "'Helvetica Neue', Helvetica, Arial" — tức là
// legend và nhãn trục trên MỌI biểu đồ đang dùng một họ chữ khác hẳn phần còn lại của
// trang, dù CSS có khai gì đi nữa (canvas không ăn CSS). Đây là nguồn "lệch font" khó
// thấy nhất. Ép về đúng font của app ở một chỗ duy nhất.

import { Chart as ChartJS, type Plugin } from 'chart.js';

export const CHART_MUTED = '#94a3b8';
export const CHART_GRID = 'rgba(255, 255, 255, 0.05)';
export const CHART_SURFACE = '#1e293b';

/** Đọc thẳng từ CSS var để chỉ có MỘT nguồn sự thật về font (xem --font-ui). */
export function appFontFamily(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim();
  return v || "'Inter', system-ui, sans-serif";
}

/**
 * Nới khoảng cách giữa legend và vùng vẽ (mặc định legend dán sát vành chart).
 *
 * Vì sao phải làm kiểu này: Chart.js KHÔNG có option nào cho khoảng cách chart↔legend.
 * `labels.padding` chỉ giãn các mục legend với nhau, `layout.padding` thì đệm cả canvas.
 * Cách duy nhất là cộng thêm chiều cao vào chính hộp legend qua hàm fit() của nó.
 *
 * Mỗi Chart có một legend riêng và beforeInit chỉ chạy 1 lần cho mỗi instance,
 * nên fit() không bị bọc chồng nhiều lần.
 */
export function legendGap(px = 24): Plugin<'doughnut'> {
  return {
    id: 'legendGap',
    beforeInit(chart) {
      const legend = chart.legend;
      if (!legend) return;
      const originalFit = legend.fit.bind(legend);
      legend.fit = () => {
        originalFit();
        legend.height += px;
      };
    },
  };
}

let applied = false;

/** Gọi một lần trước khi render biểu đồ đầu tiên. Idempotent. */
export function applyChartTheme(): void {
  if (applied) return;
  applied = true;
  ChartJS.defaults.font.family = appFontFamily();
  ChartJS.defaults.color = CHART_MUTED;
}
