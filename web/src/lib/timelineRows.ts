// Dựng các hàng của Timeline (version → feature → task). THUẦN — không React, test được.

import { NO_VERSION, groupFeaturesByVersion } from './featureGroups';
import type { Feature, FeatureLabel, Task } from '../types';

export interface TaskBar {
  task: Task;
  start: number;
  end: number;
  hasDates: boolean;
}

export interface FeatureRow {
  feature: Feature | null; // null = "Khác" (task chưa gắn feature)
  /** Task trong khoảng đang xem — có hạn trước (theo ngày bắt đầu), chưa hạn sau. */
  bars: TaskBar[];
  start: number;
  end: number;
  hasDates: boolean;
  done: number;
  total: number;
}

/** Một bản phát hành: các feature của nó, gộp lại thành một bar tổng. */
export interface VersionRow {
  key: string;
  /** Nhãn version; null = nhóm "chưa gắn version". */
  label: FeatureLabel | null;
  rows: FeatureRow[];
  start: number;
  end: number;
  hasDates: boolean;
  done: number;
  total: number;
}

/**
 * Gộp mốc thời gian + số task của các hàng con thành số liệu hàng cha.
 *
 * Chỉ lấy mốc từ hàng CÓ HẠN: hàng chưa hạn mang start/end = 0, tính cả vào thì bar
 * của cha kéo ngược về năm 1970.
 */
export function aggregate(rows: FeatureRow[]) {
  const dated = rows.filter((r) => r.hasDates);
  return {
    start: dated.length ? Math.min(...dated.map((r) => r.start)) : 0,
    end: dated.length ? Math.max(...dated.map((r) => r.end)) : 0,
    hasDates: dated.length > 0,
    done: rows.reduce((n, r) => n + r.done, 0),
    total: rows.reduce((n, r) => n + r.total, 0),
  };
}

/**
 * Gộp hàng feature theo version. Dùng CHUNG groupFeaturesByVersion với tab Features nên
 * hai chỗ luôn chia giống nhau — kể cả luật feature nhiều version nằm ở nhiều nhóm.
 *
 * Hàng "Khác" (task chưa gắn feature) nhập vào nhóm "chưa gắn version": nó không thuộc
 * bản phát hành nào, nhưng rơi khỏi timeline thì còn tệ hơn.
 */
export function buildVersionRows(rows: FeatureRow[], labels: FeatureLabel[]): VersionRow[] {
  const featureRows = rows.filter((r) => r.feature !== null);
  const otherRow = rows.find((r) => r.feature === null) ?? null;
  const byId = new Map(featureRows.map((r) => [r.feature!.id, r]));

  const out: VersionRow[] = groupFeaturesByVersion(
    featureRows.map((r) => r.feature!),
    labels,
  ).map((g) => {
    const rs = g.features.map((f) => byId.get(f.id)).filter((r): r is FeatureRow => Boolean(r));
    return { key: g.key, label: g.label, rows: rs, ...aggregate(rs) };
  });

  if (otherRow) {
    const i = out.findIndex((v) => v.key === NO_VERSION);
    if (i >= 0) {
      const merged = [...out[i].rows, otherRow];
      out[i] = { ...out[i], rows: merged, ...aggregate(merged) };
    } else {
      out.push({ key: NO_VERSION, label: null, rows: [otherRow], ...aggregate([otherRow]) });
    }
  }
  return out;
}
