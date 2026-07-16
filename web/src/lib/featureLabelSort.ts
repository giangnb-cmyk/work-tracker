// Sắp nhãn feature để hiển thị: nhãn nhóm (Shop, Gameplay…) trước theo thứ tự tạo,
// cụm version dồn về sau và MỚI NHẤT lên đầu cụm — lọc version gần như luôn là tìm
// bản vừa delivery. Version nhận diện bằng tên (labelGroup), không cần cột riêng.

import { labelGroup } from './bugLabelGroups';
import type { FeatureLabel } from '../types';

export function sortFeatureLabels(labels: FeatureLabel[]): FeatureLabel[] {
  const groups = labels.filter((l) => labelGroup(l.name) !== 'version');
  const versions = labels
    .filter((l) => labelGroup(l.name) === 'version')
    .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
  return [...groups, ...versions];
}
