// Logic lọc feature — THUẦN, không React, để test được độc lập (cùng lý do với
// taskFilter: luật OR/AND ở đây sai thì ra danh sách rỗng chứ không nổ lỗi).

import type { FilterToken } from '../components/TokenFilterBar';
import type { Feature } from '../types';

export type FeatureFacet = 'kind' | 'progress' | 'label' | 'version' | 'member';
export type FeatureFilterToken = FilterToken<FeatureFacet>;

/** Giá trị đặc biệt của facet người: không phải uid. */
const NONE = 'none';
const ANY = 'any';
const ME = 'me';

/** Giá trị của facet tiến độ. */
export const DONE = 'done';
export const OPEN = 'open';

/**
 * Tập uid người có task trong một feature. Chỉ cần `has` + `size` nên `Set<string>`
 * lẫn `Map` byUid của Features.tsx đều thoả — khỏi copy Map sang Set mỗi lần lọc.
 */
export interface UidSet {
  readonly size: number;
  has(uid: string): boolean;
}

/**
 * Số liệu một feature mà bộ lọc cần. Cố ý khớp đúng object Features.tsx đã gộp sẵn để
 * vẽ card (FeatureStats), nên chỗ gọi truyền thẳng — không tạo object mới mỗi vòng lặp.
 */
export interface FeatureStatsView {
  done: number;
  total: number;
  byUid: UidSet;
}

/**
 * Feature coi là XONG khi: được đánh dấu tay, HOẶC mọi task của nó đã xong.
 *
 * `doneAt` (0031) là lối ghi đè thủ công, thắng cả số task — dự án chạy từ trước khi có
 * tracker thì feature đã ship chẳng có task nào để suy ra, cứ nằm đó 0% mãi.
 *
 * Hai trường hợp cố tình KHÔNG tính là xong:
 * - `ongoing` (Polish, tuning…) theo định nghĩa không bao giờ có "done" — xem DATA_MODEL.
 *   Xét TRƯỚC doneAt: đánh dấu tay cũng không lật được luật này.
 * - Chưa có task nào (0/0) mà cũng không đánh dấu tay: chưa làm gì chứ không phải đã xong.
 *
 * Loại trừ theo 'ongoing' chứ KHÔNG liệt kê loại nào được tính: thêm loại mới (0030 thêm
 * 'standard') mà quên sửa chỗ này thì nó âm thầm không bao giờ xong — sai kiểu im lặng.
 */
export function isFeatureDone(f: Feature, stats: FeatureStatsView): boolean {
  if (f.kind === 'ongoing') return false;
  if (f.doneAt) return true;
  return stats.total > 0 && stats.done === stats.total;
}

/**
 * Feature có qua HẾT mọi token đang bật không? (giữa các token là AND)
 *
 * @param stats số liệu gộp từ task của feature này (rỗng nếu chưa có task).
 * @param meId uid người đang đăng nhập — cho giá trị 'me'.
 */
export function matchFeature(
  f: Feature,
  tokens: FeatureFilterToken[],
  stats: FeatureStatsView,
  meId: string,
): boolean {
  return tokens.every((tk) => {
    let hit: boolean;
    switch (tk.facet) {
      // OR: một feature chỉ mang ĐÚNG MỘT kind.
      case 'kind':
        hit = tk.values.includes(f.kind);
        break;
      // OR: xong/chưa xong là nhị phân — chọn cả hai nghĩa là không lọc gì.
      case 'progress': {
        const finished = isFeatureDone(f, stats);
        hit = tk.values.some((v) => (v === DONE ? finished : !finished));
        break;
      }
      // AND: nhãn nhóm cộng dồn — "là Shop, IAP" nghĩa là feature mang cả hai.
      case 'label':
        hit = tk.values.every((v) => f.labelIds.includes(v));
        break;
      // OR chứ không AND: một feature gần như luôn delivery ở MỘT version, hiểu theo
      // AND thì chọn hai version là luôn ra rỗng. Cùng lý do với version bên bug.
      case 'version':
        hit = tk.values.some((v) => f.labelIds.includes(v));
        break;
      case 'member': {
        const uids = stats.byUid;
        hit = tk.values.some((v) =>
          v === NONE ? uids.size === 0 : v === ANY ? uids.size > 0 : uids.has(v === ME ? meId : v),
        );
        break;
      }
    }
    return tk.op === 'is' ? hit : !hit;
  });
}
