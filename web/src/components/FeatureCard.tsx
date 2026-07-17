import BugLabelChip from './bug/BugLabelChip';
import FeatureAvatars, { type FeaturePerson } from './FeatureAvatars';
import { CheckCircleIcon } from './icons';
import type { VersionChip } from '../lib/versionRange';
import type { Feature, FeatureLabel } from '../types';

interface Props {
  feature: Feature;
  /** Nhãn NHÓM (Shop, IAP…) đã resolve từ labelIds; version đi riêng ở `versions`. */
  labels: FeatureLabel[];
  /** Chip version đã gộp khoảng (1.0.x → 1.5.x) — cha tính, xem lib/versionRange. */
  versions: VersionChip[];
  /** Người có task trong feature, đã sắp sẵn (nhiều task trước). */
  people: FeaturePerson[];
  done: number;
  total: number;
  /** Số task xong trong 30 ngày — chỉ dùng cho feature `ongoing`. */
  done30: number;
  /** Đã xong hay chưa. Cha truyền xuống để dùng CHUNG luật với bộ lọc (isFeatureDone). */
  finished: boolean;
  onOpen: () => void;
}

/** Một thẻ feature trong lưới: icon, tên, nhãn, tiến độ, người làm. */
export default function FeatureCard({
  feature, labels, versions, people, done, total, done30, finished, onOpen,
}: Props) {
  // Đánh dấu tay là xong -> thanh phải đầy. Không thì feature import (0/0 task) tick
  // "đã hoàn thành" mà vẫn nằm đó 0% — đúng cái nó vừa được bảo là không phải.
  const percent = finished ? 100 : total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <button className={`project-card feat-card glass${finished ? ' done' : ''}`} onClick={onOpen}>
      {finished && (
        <span className="feat-done-mark" title="Đã hoàn thành" aria-label="Đã hoàn thành">
          <CheckCircleIcon size={20} />
        </span>
      )}
      <span className="project-icon" style={{ background: `${feature.color}22` }}>{feature.icon}</span>
      <span className="project-name">{feature.name}</span>
      {(labels.length > 0 || versions.length > 0) && (
        <span className="feat-chips feat-chips-lg">
          {labels.map((l) => <BugLabelChip key={l.id} label={l} />)}
          {versions.map((v) => <BugLabelChip key={v.key} label={v} />)}
        </span>
      )}
      {feature.kind === 'ongoing' ? (
        // Feature liên tục không có "done" — % vô nghĩa, hiện nhịp làm thay thế.
        <span className="project-meta">🔁 {total - done} đang mở · {done30} xong /30 ngày</span>
      ) : (
        <>
          <span className="project-meta">{done}/{total} task xong</span>
          <span className="feat-prog">
            <span className="progress"><span style={{ width: `${percent}%` }} /></span>
            <span className="feat-pct mono">{percent}%</span>
          </span>
        </>
      )}
      <FeatureAvatars people={people} />
    </button>
  );
}
