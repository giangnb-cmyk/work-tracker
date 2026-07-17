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
  /** Ngày phát hành đã chốt (0032); null = chưa chốt -> mốc suy từ hạn task. */
  releaseMs: number | null;
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
    return {
      key: g.key,
      label: g.label,
      rows: rs,
      ...aggregate(rs),
      releaseMs: g.label?.releaseDate?.toMillis() ?? null,
    };
  });

  if (otherRow) {
    const i = out.findIndex((v) => v.key === NO_VERSION);
    if (i >= 0) {
      const merged = [...out[i].rows, otherRow];
      out[i] = { ...out[i], rows: merged, ...aggregate(merged) };
    } else {
      out.push({
        key: NO_VERSION, label: null, rows: [otherRow], ...aggregate([otherRow]), releaseMs: null,
      });
    }
  }
  return applyReleaseWindows(out);
}

/**
 * Version nào đã CHỐT ngày phát hành thì bar chạy theo lịch, không suy từ hạn task nữa:
 * [ngày phát hành bản TRƯỚC → ngày phát hành của nó] — đúng cửa sổ làm ra bản đó.
 *
 * Vì sao không lấy mốc từ task: lịch phát hành chốt trước và không nhúc nhích khi một
 * task bị dời hạn. Suy ngược từ task ra là để cái đuôi vẫy con chó — nhìn vào tưởng lịch
 * đổi, trong khi sheet vẫn ghi y nguyên.
 *
 * Bản ĐẦU TIÊN không có "bản trước" -> lùi về ngày task sớm nhất của nó; không có task
 * nào có hạn thì bar co lại thành một mốc đúng ngày phát hành.
 * Version CHƯA chốt ngày -> giữ nguyên mốc suy từ task (hành vi cũ, không gãy).
 *
 * `out` đã sắp version giảm dần (groupFeaturesByVersion) nên "bản trước" nằm ở chỉ số
 * lớn hơn; nhóm "chưa gắn version" không có ngày nên tự rơi vào nhánh giữ nguyên.
 */
function applyReleaseWindows(out: VersionRow[]): VersionRow[] {
  const dated = out.filter((v) => v.releaseMs !== null);
  return out.map((v) => {
    if (v.releaseMs === null) return v;
    const older = dated.filter((o) => (o.releaseMs as number) < v.releaseMs!);
    const prev = older.length ? Math.max(...older.map((o) => o.releaseMs as number)) : null;
    const start = prev ?? (v.hasDates ? Math.min(v.start, v.releaseMs) : v.releaseMs);
    return { ...v, start, end: v.releaseMs, hasDates: true };
  });
}
