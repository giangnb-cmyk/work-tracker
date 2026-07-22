import { useState } from 'react';

/** Bỏ mọi ký tự không phải số → number. "30.000.000" / "30,000,000₫" đều ra 30000000. */
function parseVnd(s: string): number {
  const digits = (s.match(/\d/g) ?? []).join('');
  return digits ? Number(digits) : 0;
}

interface Props {
  value: number;
  onCommit: (n: number) => void;
  className?: string;
  ariaLabel?: string;
}

/**
 * Ô nhập tiền: lúc KHÔNG focus hiện số nhóm nghìn ("30.000.000"); lúc focus cho gõ số thô
 * và chọn sẵn toàn bộ. Chỉ ghi khi rời ô (onBlur) và giá trị thực sự đổi — hợp với lối
 * sửa-trên-ô của cả tab (realtime sẽ dội lại).
 */
export default function MoneyInput({ value, onCommit, className, ariaLabel }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? value.toLocaleString('vi-VN');

  return (
    <input
      className={`input cost-money mono${className ? ` ${className}` : ''}`}
      inputMode="numeric"
      aria-label={ariaLabel}
      value={display}
      onFocus={(e) => {
        setDraft(String(value));
        const el = e.currentTarget;
        requestAnimationFrame(() => el.select());
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = parseVnd(draft ?? '');
        setDraft(null);
        if (n !== value) onCommit(n);
      }}
    />
  );
}
