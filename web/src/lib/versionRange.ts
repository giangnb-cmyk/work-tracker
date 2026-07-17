// Gộp nhãn version liền nhau thành khoảng "1.0.x → 1.5.x". THUẦN — không React.

import { labelGroup } from './bugLabelGroups';
import type { FeatureLabel } from '../types';

/** Một chip version để vẽ: một version lẻ, hoặc một khoảng liền nhau. Thoả ChipLabel. */
export interface VersionChip {
  key: string;
  name: string;
  color: string;
  icon: string;
}

/** Từ 3 version liền nhau trở lên mới gộp: "1.4.x → 1.5.x" còn DÀI hơn để rời hai chip. */
const MIN_RUN = 3;

function ascending(a: FeatureLabel, b: FeatureLabel): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true });
}

/**
 * Nhãn version của một feature -> danh sách chip, gộp các version LIỀN NHAU thành khoảng.
 *
 * "Liền nhau" xét theo thứ tự PALETTE của dự án, không phải theo số học: chỉ gộp khi
 * giữa hai đầu không còn version nào khác của dự án. Feature ship ở {1.0.x, 1.5.x} mà
 * hiện "1.0.x → 1.5.x" là nói dối — nó không có ở 1.1–1.4.
 *
 * @param own nhãn của feature (lẫn nhãn nhóm cũng được — hàm tự lọc lấy version).
 * @param palette cả bộ nhãn của dự án.
 */
export function versionRangeChips(own: FeatureLabel[], palette: FeatureLabel[]): VersionChip[] {
  const all = palette.filter((l) => labelGroup(l.name) === 'version').sort(ascending);
  const rank = new Map(all.map((l, i) => [l.id, i]));

  // Bỏ nhãn không có trong palette (đã xoá) — không xếp được vào đâu để xét liền nhau.
  const mine = own.filter((l) => rank.has(l.id)).sort(ascending);
  if (mine.length === 0) return [];

  const chips: VersionChip[] = [];
  let run: FeatureLabel[] = [];

  function flush() {
    if (run.length === 0) return;
    if (run.length >= MIN_RUN) {
      const first = run[0];
      const last = run[run.length - 1];
      chips.push({
        key: `${first.id}:${last.id}`,
        name: `${first.name} → ${last.name}`,
        color: first.color,
        icon: '',
      });
    } else {
      for (const l of run) chips.push({ key: l.id, name: l.name, color: l.color, icon: l.icon });
    }
    run = [];
  }

  for (const l of mine) {
    const prev = run[run.length - 1];
    // Hụt một bậc trong palette = đứt khoảng -> chốt khoảng đang gom rồi mở khoảng mới.
    if (prev && rank.get(l.id) !== (rank.get(prev.id) as number) + 1) flush();
    run.push(l);
  }
  flush();

  return chips;
}
