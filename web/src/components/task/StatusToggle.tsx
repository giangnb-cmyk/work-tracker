import { useEffect, useRef } from 'react';
import type { TaskStatus } from '../../types';

interface Props {
  value: TaskStatus;
  onChange: (next: TaskStatus) => void;
  disabled: boolean;
}

/**
 * iOS-style done switch. ON → 'done'; OFF restores the last non-done status
 * (so a task parked in "Đang làm"/"Review" isn't flattened to "todo" by an
 * accidental toggle). The data model keeps all 4 statuses — only this control
 * is binary, per the requested "Hoàn thành / Chưa làm" label.
 */
export default function StatusToggle({ value, onChange, disabled }: Props) {
  const isDone = value === 'done';
  const prevRef = useRef<TaskStatus>(isDone ? 'todo' : value);

  useEffect(() => {
    if (value !== 'done') prevRef.current = value;
  }, [value]);

  function toggle() {
    if (disabled) return;
    onChange(isDone ? prevRef.current : 'done');
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDone}
      aria-label="Trạng thái hoàn thành"
      className={`status-toggle${isDone ? ' on' : ''}${disabled ? ' disabled' : ''}`}
      disabled={disabled}
      onClick={toggle}
    >
      <span className="stg-track" aria-hidden>
        <span className="stg-thumb" />
      </span>
      <span className="stg-label">{isDone ? 'Hoàn thành' : 'Chưa làm'}</span>
    </button>
  );
}
