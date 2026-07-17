import Avatar from './Avatar';

/** Một người đang có task trong feature; `count` để xếp ai làm nhiều lên trước. */
export interface FeaturePerson {
  uid: string;
  name: string;
  photoURL?: string;
  count: number;
}

interface FeatureAvatarsProps {
  /** Đã gộp + sắp xếp sẵn ở phía gọi (memo hoá theo tasks/members). */
  people: FeaturePerson[];
  /** Số avatar hiện tối đa; phần dư gom vào "+N". */
  max?: number;
}

/** Chồng avatar của những người có task trong feature, hiện ở đáy card Features. */
export default function FeatureAvatars({ people, max = 5 }: FeatureAvatarsProps) {
  if (people.length === 0) return null;

  const shown = people.slice(0, max);
  const rest = people.length - shown.length;

  return (
    <span className="feat-people">
      {shown.map((p) => (
        <span key={p.uid} className="feat-person" title={`${p.name} · ${p.count} task`}>
          <Avatar name={p.name} photoURL={p.photoURL} size="sm" />
        </span>
      ))}
      {rest > 0 && (
        <span className="feat-person-more" title={people.slice(max).map((p) => p.name).join(', ')}>
          +{rest}
        </span>
      )}
    </span>
  );
}
