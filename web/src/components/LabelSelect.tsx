import { useCallback, useRef, useState } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';
import BugLabelChip, { type ChipLabel } from './bug/BugLabelChip';

/** Nhãn hiện được trong dropdown — FeatureLabel lẫn BugLabel đều thoả. */
export interface SelectableLabel extends ChipLabel {
  id: string;
}

interface Props {
  options: SelectableLabel[];
  /**
   * TOÀN BỘ nhãn đang chọn của feature (cả nhãn ngoài `options`) — component tự lọc phần
   * thuộc về mình để hiện chip.
   */
  selectedIds: string[];
  /**
   * Bật/tắt MỘT nhãn. Cố ý không trả về cả mảng: chỗ gọi giữ nguyên các nhãn thuộc
   * dropdown kia — và cả nhãn chưa kịp tải xong — thay vì bị ghi đè mất.
   */
  onToggle: (id: string) => void;
  placeholder: string;
  emptyHint: string;
  disabled?: boolean;
}

/** Dropdown chọn NHIỀU nhãn: nút hiện chip đã chọn, mở ra tick từng nhãn. */
export default function LabelSelect({
  options,
  selectedIds,
  onToggle,
  placeholder,
  emptyHint,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(wrapRef, close, open);

  const picked = options.filter((o) => selectedIds.includes(o.id));

  return (
    <div className="lsel" ref={wrapRef}>
      <button
        type="button"
        className={`lsel-btn${open ? ' open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-expanded={open}
      >
        <span className="lsel-vals">
          {picked.length === 0
            ? <span className="lsel-ph">{placeholder}</span>
            : picked.map((o) => <BugLabelChip key={o.id} label={o} small />)}
        </span>
        <span className="lsel-caret" aria-hidden>▾</span>
      </button>

      {open && (
        <div className="lsel-pop">
          {options.length === 0 ? (
            <p className="lsel-empty">{emptyHint}</p>
          ) : (
            options.map((o) => {
              const on = selectedIds.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  className={`lsel-opt${on ? ' on' : ''}`}
                  onClick={() => onToggle(o.id)}
                >
                  <span className="lsel-check" aria-hidden>{on ? '✓' : ''}</span>
                  <BugLabelChip label={o} small />
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
