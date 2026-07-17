import { useState } from 'react';
import Avatar from '../Avatar';
import BugLabelChip from './BugLabelChip';
import { isRedundantStatusLabel } from '../../lib/bugStatus';
import { BUG_STATUSES, BUG_STATUS_LABEL, type Bug, type BugLabel, type BugStatus } from '../../types';

interface Props {
  bugs: Bug[];
  labelsById: Map<string, BugLabel>;
  onOpen: (bug: Bug) => void;
  onMove: (bug: Bug, status: BugStatus) => void;
  canEditBug: (bug: Bug) => boolean;
}

/** Kanban board: one column per bug status; drag a card to change status. */
export default function BugKanban({ bugs, labelsById, onOpen, onMove, canEditBug }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<BugStatus | null>(null);

  function drop(status: BugStatus) {
    const b = bugs.find((x) => x.id === dragId);
    setOverCol(null);
    setDragId(null);
    if (b && b.status !== status && canEditBug(b)) onMove(b, status);
  }

  return (
    <div className="bug-board">
      {BUG_STATUSES.map((status) => {
        const col = bugs.filter((b) => b.status === status);
        return (
          <div
            key={status}
            className={`bug-col${overCol === status ? ' over' : ''}`}
            onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverCol(status); } }}
            onDragLeave={() => setOverCol((c) => (c === status ? null : c))}
            onDrop={() => drop(status)}
          >
            <div className="bug-col-head">
              <span className={`bug-col-dot s-${status}`} />
              {BUG_STATUS_LABEL[status]}
              <span className="bug-col-count">{col.length}</span>
            </div>
            <div className="bug-col-body">
              {col.map((b) => {
                const draggable = canEditBug(b);
                return (
                  <div
                    key={b.id}
                    className={`bug-card${dragId === b.id ? ' dragging' : ''}`}
                    draggable={draggable}
                    onDragStart={() => setDragId(b.id)}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    onClick={() => onOpen(b)}
                  >
                    <div className="bug-card-top">
                      <span className="bug-num mono">#{b.number}</span>
                      {b.assigneeName && <Avatar name={b.assigneeName} size="sm" />}
                    </div>
                    <div className="bug-card-title">{b.title}</div>
                    {/* Bỏ chip trùng: cột đang đứng ĐÃ LÀ trạng thái, thẻ khỏi nhắc lại. */}
                    {(() => {
                      const chips = b.labelIds
                        .map((id) => labelsById.get(id))
                        .filter((l): l is BugLabel => l !== undefined && !isRedundantStatusLabel(l.name, b.status));
                      return chips.length > 0 && (
                        <div className="bug-card-labels">
                          {chips.map((l) => <BugLabelChip key={l.id} label={l} small />)}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
              {col.length === 0 && <div className="bug-col-empty">—</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
