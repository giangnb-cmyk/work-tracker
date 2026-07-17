// Dựng các hàng của Timeline (version → feature → task). THUẦN — không React, test được.

import { NO_VERSION, groupFeaturesByVersion } from './featureGroups';
import { labelGroup } from './bugLabelGroups';
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
/**
 * @param projectStartMs mốc tạo dự án — điểm bắt đầu của bản ĐẦU TIÊN (nó không có bản
 *   nào trước để bám vào). null = không biết -> bar co thành một mốc ở ngày phát hành.
 */
export function buildVersionRows(
  rows: FeatureRow[],
  labels: FeatureLabel[],
  projectStartMs: number | null = null,
): VersionRow[] {
  const featureRows = rows.filter((r) => r.feature !== null);
  const otherRow = rows.find((r) => r.feature === null) ?? null;
  const byId = new Map(featureRows.map((r) => [r.feature!.id, r]));

  const grouped = groupFeaturesByVersion(featureRows.map((r) => r.feature!), labels);
  const byKey = new Map(grouped.map((g) => [g.key, g]));

  /**
   * Duyệt từ PALETTE chứ không từ groupFeaturesByVersion: hàm đó bỏ nhóm rỗng (đúng cho
   * tab Features, ở đó version chưa có feature nào chỉ là nhiễu). Nhưng Timeline dựng
   * từ dưới lên — không task thì không feature-row, không feature-row thì mất luôn cả
   * version. Mà một bản ĐÃ CHỐT NGÀY PHÁT HÀNH là mốc có thật: giấu nó đi thì lộ trình
   * chẳng còn gì để xem, đúng lúc chưa kịp tạo task mới là lúc cần nhìn lịch nhất.
   */
  const versions = labels
    .filter((l) => labelGroup(l.name) === 'version')
    .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));

  const out: VersionRow[] = versions
    .map((l) => {
      const g = byKey.get(l.id);
      const rs = (g?.features ?? [])
        .map((f) => byId.get(f.id))
        .filter((r): r is FeatureRow => Boolean(r));
      return {
        key: l.id,
        label: l,
        rows: rs,
        ...aggregate(rs),
        releaseMs: l.releaseDate?.toMillis() ?? null,
      };
    })
    // Version vừa chưa có việc gì VỪA chưa chốt ngày thì đúng là nhiễu — bỏ.
    .filter((v) => v.rows.length > 0 || v.releaseMs !== null);

  const noVersion = byKey.get(NO_VERSION);
  const restRows = [
    ...(noVersion?.features ?? []).map((f) => byId.get(f.id)).filter((r): r is FeatureRow => Boolean(r)),
    ...(otherRow ? [otherRow] : []),
  ];
  if (restRows.length > 0) {
    out.push({ key: NO_VERSION, label: null, rows: restRows, ...aggregate(restRows), releaseMs: null });
  }

  return applyReleaseWindows(out, projectStartMs);
}

/**
 * Version nào đã CHỐT ngày phát hành thì bar chạy theo lịch, không suy từ hạn task nữa:
 * [ngày phát hành bản TRƯỚC → ngày phát hành của nó] — đúng cửa sổ làm ra bản đó.
 *
 * Vì sao không lấy mốc từ task: lịch phát hành chốt trước và không nhúc nhích khi một
 * task bị dời hạn. Suy ngược từ task ra là để cái đuôi vẫy con chó — nhìn vào tưởng lịch
 * đổi, trong khi sheet vẫn ghi y nguyên. Cũng vì thế mà mốc đầu KHÔNG lấy theo task sớm
 * nhất: task dời một cái là bản 1.0.x đổi độ dài, dù chẳng có gì trong lịch đổi.
 *
 * Bản ĐẦU TIÊN không có "bản trước" -> lấy mốc TẠO DỰ ÁN. Không biết mốc đó (hoặc nó
 * muộn hơn cả ngày phát hành, tức dữ liệu vô lý) thì bar co lại thành một mốc đúng ngày
 * phát hành, chứ không vẽ ngược về quá khứ.
 *
 * Version CHƯA chốt ngày -> giữ nguyên mốc suy từ task (hành vi cũ, không gãy); nhóm
 * "chưa gắn version" không có ngày nên tự rơi vào nhánh đó.
 */
function applyReleaseWindows(out: VersionRow[], projectStartMs: number | null): VersionRow[] {
  const dated = out.filter((v) => v.releaseMs !== null);
  return out.map((v) => {
    if (v.releaseMs === null) return v;
    const release = v.releaseMs;
    const older = dated.filter((o) => (o.releaseMs as number) < release);
    const prev = older.length ? Math.max(...older.map((o) => o.releaseMs as number)) : null;
    const first = projectStartMs !== null && projectStartMs < release ? projectStartMs : release;
    return { ...v, start: prev ?? first, end: release, hasDates: true };
  });
}
