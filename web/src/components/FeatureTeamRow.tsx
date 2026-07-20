import Avatar from './Avatar';
import type { FeaturePerson } from './FeatureAvatars';

interface FeatureTeamRowProps {
  /** Đã gộp + sắp xếp sẵn ở phía gọi: ai nhiều task đứng trước. */
  people: FeaturePerson[];
}

/**
 * Ai đang làm feature này — avatar + TÊN + số task, ở đầu trang chi tiết.
 * Khác FeatureAvatars (chồng avatar, không tên) vốn để nhét vừa đáy card ngoài lưới.
 */
export default function FeatureTeamRow({ people }: FeatureTeamRowProps) {
  if (people.length === 0) return null;

  return (
    <div className="feat-block">
      <span className="feat-cap">Các member tham gia</span>
      <div className="feat-team-list">
        {people.map((p) => (
          <span
            key={p.uid}
            className="feat-mate"
            title={p.count > 0 ? `${p.name} · ${p.count} task` : `${p.name} · thêm tay, chưa có task`}
          >
            <Avatar name={p.name} photoURL={p.photoURL} size="sm" />
            <span className="feat-mate-name">{p.name}</span>
            {/* count 0 = người thêm tay chưa có task: ẩn số, khỏi hiện "0" trơ trọi. */}
            {p.count > 0 && <span className="feat-mate-n mono">{p.count}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
