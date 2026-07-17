import Avatar from '../Avatar';
import BugLabelChip from './BugLabelChip';
import { formatDate, timeAgo } from '../../lib/format';
import { isRedundantStatusLabel } from '../../lib/bugStatus';
import { BUG_STATUS_LABEL, type Bug, type BugLabel } from '../../types';

interface Props {
  bugs: Bug[];
  labelsById: Map<string, BugLabel>;
  projectName: string;
  onOpen: (bug: Bug) => void;
}

/** GitLab-style issue list: title + labels, reference line, assignee, updated. */
export default function BugList({ bugs, labelsById, projectName, onOpen }: Props) {
  if (bugs.length === 0) {
    return <div className="glass empty">Chưa có bug nào.</div>;
  }
  return (
    <div className="glass bug-list">
      {bugs.map((b) => (
        <div key={b.id} className="bug-row" onClick={() => onOpen(b)}>
          <div className="bug-row-main">
            <div className="bug-row-title">
              <span className="bug-row-ic" aria-hidden>🐞</span>
              <span className="bug-row-name">{b.title}</span>
              <span className={`bug-row-status s-${b.status}`}>{BUG_STATUS_LABEL[b.status]}</span>
              {/* Bỏ chip trùng với badge trạng thái ngay bên cạnh — xem isRedundantStatusLabel. */}
              {b.labelIds
                .map((id) => labelsById.get(id))
                .filter((l): l is BugLabel => l !== undefined && !isRedundantStatusLabel(l.name, b.status))
                .map((l) => <BugLabelChip key={l.id} label={l} small />)}
            </div>
            <div className="bug-row-ref muted">
              {projectName}<span className="bug-row-num">#{b.number}</span> · tạo {formatDate(b.createdAt)} bởi {b.reporterName || '—'}
            </div>
          </div>
          <div className="bug-row-side">
            {b.assigneeName ? <Avatar name={b.assigneeName} size="sm" /> : <span className="bug-row-unassigned" title="Chưa giao">○</span>}
            <span className="bug-row-updated muted">cập nhật {timeAgo(b.updatedAt) || '—'}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
