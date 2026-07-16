import { useMemo } from 'react';
import SearchableSelect from '../SearchableSelect';
import { formatDateRange } from '../../lib/format';
import type { Sprint } from '../../types';

interface SprintRangePickerProps {
  /** Đã sắp theo thứ tự thời gian. */
  sprints: Sprint[];
  fromId: string;
  toId: string;
  onChange: (fromId: string, toId: string) => void;
  /** Khoảng đã giải ra sau khi chuẩn hoá — hiện lại cho người dùng thấy. */
  resolvedCount: number;
}

/**
 * Một hàng lọc duy nhất, đặt TRÊN mọi thẻ và scope toàn bộ trang — không nhét bộ lọc
 * riêng vào từng thẻ.
 *
 * Cố ý không tự tráo khi chọn ngược (A sau B): viết đè lựa chọn của người dùng là hành vi
 * gây bất ngờ. `sprintsInRange` tự chuẩn hoá, và số sprint đã giải ra được in ngay đây.
 */
export default function SprintRangePicker({
  sprints,
  fromId,
  toId,
  onChange,
  resolvedCount,
}: SprintRangePickerProps) {
  const options = useMemo(
    () =>
      sprints.map((s) => ({
        value: s.id,
        label: `${s.name} · ${formatDateRange(s.startDate, s.endDate)}`,
      })),
    [sprints],
  );

  return (
    <div className="filter-bar perf-range">
      <span className="perf-range-lbl">Từ sprint</span>
      <div className="perf-range-field">
        <SearchableSelect
          value={fromId}
          onChange={(v) => onChange(v, toId)}
          options={options}
          placeholder="Chọn sprint…"
          panel="overlay"
        />
      </div>
      <span className="perf-range-lbl">đến</span>
      <div className="perf-range-field">
        <SearchableSelect
          value={toId}
          onChange={(v) => onChange(fromId, v)}
          options={options}
          placeholder="Chọn sprint…"
          panel="overlay"
        />
      </div>
      <span className="perf-range-count mono">{resolvedCount} sprint</span>
    </div>
  );
}
