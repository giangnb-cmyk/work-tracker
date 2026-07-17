import { useEffect, useRef } from 'react';
import Switch from '../Switch';
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
 *
 * Phần nhìn nằm ở components/Switch (dùng chung với chỗ khác); ở đây chỉ còn luật
 * ánh xạ bool <-> TaskStatus.
 */
export default function StatusToggle({ value, onChange, disabled }: Props) {
  const isDone = value === 'done';
  const prevRef = useRef<TaskStatus>(isDone ? 'todo' : value);

  useEffect(() => {
    if (value !== 'done') prevRef.current = value;
  }, [value]);

  return (
    <Switch
      checked={isDone}
      onChange={(next) => onChange(next ? 'done' : prevRef.current)}
      label={isDone ? 'Hoàn thành' : 'Chưa làm'}
      disabled={disabled}
      ariaLabel="Trạng thái hoàn thành"
    />
  );
}
