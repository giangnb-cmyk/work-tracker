import type { MemberScore } from '../lib/sprint';
import Avatar from './Avatar';

const MEDALS = ['🥇', '🥈', '🥉'];

interface MemberLeaderboardProps {
  title: string;
  icon: string;
  entries: MemberScore[];
  /** Gắn huy chương cho 3 vị trí đầu — chỉ hợp với bảng "nhiều nhất". */
  medals?: boolean;
  emptyText: string;
}

/** Một đầu của bảng xếp hạng thành viên trong sprint (xem `rankByDone`). */
export default function MemberLeaderboard({
  title,
  icon,
  entries,
  medals = false,
  emptyText,
}: MemberLeaderboardProps) {
  return (
    <div className="glass section" style={{ padding: '1.5rem' }}>
      <h3>
        {icon} {title}
      </h3>
      {entries.length === 0 ? (
        <div className="empty">{emptyText}</div>
      ) : (
        <div className="lb-list">
          {entries.map((m, i) => (
            <div key={m.uid} className="lb-row">
              <span className="lb-rank">{medals ? MEDALS[i] ?? i + 1 : i + 1}</span>
              <Avatar name={m.name} photoURL={m.photoURL} size="sm" />
              <span className="lb-name">{m.name}</span>
              <span className="lb-pts muted mono">{m.donePoints} pts</span>
              <span className="lb-score mono">
                {m.done}
                <span className="muted">/{m.total}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
