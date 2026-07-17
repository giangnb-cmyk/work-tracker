// Gom feature theo version cho tab Features. THUẦN — không React, test được độc lập.

import { labelGroup } from './bugLabelGroups';
import type { Feature, FeatureLabel } from '../types';

/** Khoá nhóm "chưa gắn version" — cố ý không phải id nhãn nào. */
export const NO_VERSION = '__no_version__';

export interface FeatureVersionGroup {
  /** id nhãn version, hoặc NO_VERSION. */
  key: string;
  /** Nhãn version của nhóm; null = nhóm "chưa gắn version". */
  label: FeatureLabel | null;
  features: Feature[];
}

/**
 * Mới nhất lên đầu. So theo SỐ chứ không theo chữ: so chữ thì '1.10.x' đứng trước
 * '1.9.x' vì '1' < '9'.
 */
function byVersionDesc(a: FeatureLabel, b: FeatureLabel): number {
  return b.name.localeCompare(a.name, undefined, { numeric: true });
}

/**
 * Gom feature theo nhãn version — version mới nhất trước, nhóm rỗng bị bỏ.
 *
 * Feature mang NHIỀU version (Starter Pack: 1.0.x–1.5.x) xuất hiện ở TỪNG nhóm, không
 * phải chỉ nhóm cao nhất: đúng như sheet release liệt kê nó ở mọi tab version, và đúng
 * câu người dùng đang hỏi khi xổ một nhóm ra — "bản này ship những gì".
 *
 * @param labels cả palette cũng được — hàm tự lọc lấy nhãn version.
 */
export function groupFeaturesByVersion(
  features: Feature[],
  labels: FeatureLabel[],
): FeatureVersionGroup[] {
  const versions = labels.filter((l) => labelGroup(l.name) === 'version').sort(byVersionDesc);

  const groups: FeatureVersionGroup[] = [];
  const grouped = new Set<string>();

  for (const label of versions) {
    const inGroup = features.filter((f) => f.labelIds.includes(label.id));
    if (inGroup.length === 0) continue;
    inGroup.forEach((f) => grouped.add(f.id));
    groups.push({ key: label.id, label, features: inGroup });
  }

  // Còn lại = không mang nhãn version nào (hoặc mang nhãn đã bị xoá khỏi palette). Phải
  // hiện, không được rơi mất — nếu không thì feature "biến mất" khỏi tab mà không rõ vì sao.
  const rest = features.filter((f) => !grouped.has(f.id));
  if (rest.length > 0) groups.push({ key: NO_VERSION, label: null, features: rest });

  return groups;
}
