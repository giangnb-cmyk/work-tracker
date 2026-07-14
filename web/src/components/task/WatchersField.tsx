import Avatar from '../Avatar';
import { JOB_ROLE_LABEL, type TeamMember } from '../../types';

interface Props {
  members: TeamMember[];
  watcherIds: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
}

/** Multi-select of related people (watchers) — they get mentioned on completion. */
export default function WatchersField({ members, watcherIds, onChange, disabled }: Props) {
  function toggle(uid: string) {
    onChange(
      watcherIds.includes(uid) ? watcherIds.filter((id) => id !== uid) : [...watcherIds, uid],
    );
  }

  return (
    <div className="field">
      <span className="field-label">Người liên quan (được báo khi hoàn thành)</span>
      <div className="watcher-list">
        {members.map((m) => {
          const active = watcherIds.includes(m.uid);
          return (
            <button
              key={m.uid}
              type="button"
              className={`watcher-chip${active ? ' active' : ''}`}
              disabled={disabled}
              onClick={() => toggle(m.uid)}
            >
              <Avatar name={m.displayName} photoURL={m.photoURL} size="sm" />
              <span>{m.displayName}</span>
              {m.jobRole && <span className="muted" style={{ fontSize: '0.68rem' }}>{JOB_ROLE_LABEL[m.jobRole]}</span>}
            </button>
          );
        })}
        {members.length === 0 && <span className="muted">Chưa có thành viên.</span>}
      </div>
    </div>
  );
}
