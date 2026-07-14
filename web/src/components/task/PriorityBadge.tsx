import { useEffect, useRef, useState } from 'react';
import { PRIORITY_LABEL, TASK_PRIORITIES, type TaskPriority } from '../../types';

export const PRIO_COLOR: Record<TaskPriority, string> = {
  low: '#94a3b8',
  medium: '#fbbf24',
  high: '#fb923c',
  urgent: '#ef4444',
};

interface Props {
  value: TaskPriority;
  onChange: (next: TaskPriority) => void;
  disabled: boolean;
}

/** Header priority pill — click to open a dropdown and pick a priority. */
export default function PriorityBadge({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function pick(p: TaskPriority) {
    onChange(p);
    setOpen(false);
  }

  return (
    <div className="prio-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`prio-pill prio-pill-btn${open ? ' open' : ''}`}
        style={{ color: PRIO_COLOR[value] }}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title="Độ ưu tiên"
      >
        <span className="prio-dot" style={{ background: PRIO_COLOR[value] }} />
        {PRIORITY_LABEL[value]}
        {!disabled && <span className="prio-caret">▾</span>}
      </button>

      {open && (
        <div className="prio-pop">
          {TASK_PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              className={`prio-opt${p === value ? ' selected' : ''}`}
              onClick={() => pick(p)}
            >
              <span className="prio-dot" style={{ background: PRIO_COLOR[p] }} />
              <span style={{ color: PRIO_COLOR[p] }}>{PRIORITY_LABEL[p]}</span>
              {p === value && <span className="prio-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
