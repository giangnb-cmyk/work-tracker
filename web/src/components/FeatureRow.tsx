import BugLabelChip from './bug/BugLabelChip';
import FeatureAvatars, { type FeaturePerson } from './FeatureAvatars';
import { CheckCircleIcon } from './icons';
import type { VersionChip } from '../lib/versionRange';
import type { Feature, FeatureLabel } from '../types';

interface Props {
  feature: Feature;
  labels: FeatureLabel[];
  versions: VersionChip[];
  people: FeaturePerson[];
  done: number;
  total: number;
  done30: number;
  finished: boolean;
  onOpen: () => void;
}

/**
 * Feature ở dạng MỘT DÒNG — cùng dữ liệu với {@link FeatureCard}, khác cách đọc.
 *
 * Thẻ hợp lúc lướt (icon to, chip xuống dòng thoải mái); dòng hợp lúc dò và so: mọi cột
 * thẳng hàng nên quét dọc một phát là ra feature nào tụt. Dự án vài chục feature thì lưới
 * thẻ phải cuộn ba màn mới hết.
 */
export default function FeatureRow({
  feature, labels, versions, people, done, total, done30, finished, onOpen,
}: Props) {
  const percent = finished ? 100 : total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <button className={`feat-row${finished ? ' done' : ''}`} onClick={onOpen}>
      <span className="feat-row-icon" style={{ background: `${feature.color}22` }}>{feature.icon}</span>
      <span className="feat-row-name">
        {feature.name}
        {finished && (
          <span className="feat-row-check" title="Đã hoàn thành" aria-label="Đã hoàn thành">
            <CheckCircleIcon size={14} />
          </span>
        )}
      </span>
      <span className="feat-row-chips">
        {labels.map((l) => <BugLabelChip key={l.id} label={l} />)}
        {versions.map((v) => <BugLabelChip key={v.key} label={v} />)}
      </span>
      <FeatureAvatars people={people} />
      {feature.kind === 'ongoing' ? (
        // Feature liên tục không có đích nên không có %; giữ nguyên nhịp 30 ngày như card.
        <span className="feat-row-meta">🔁 {total - done} mở · {done30}/30 ngày</span>
      ) : (
        <>
          <span className="feat-row-meta mono">{done}/{total}</span>
          <span className="progress feat-row-bar" aria-hidden>
            <span style={{ width: `${percent}%` }} />
          </span>
          <span className="feat-row-pct mono">{percent}%</span>
        </>
      )}
    </button>
  );
}
