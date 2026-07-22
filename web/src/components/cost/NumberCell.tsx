import { useState } from 'react';

interface Props {
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  className?: string;
  ariaLabel?: string;
}

/** Ô nhập số nguyên (vd số người) sửa-trên-ô. Ghi khi rời ô, kẹp về `min`. */
export default function NumberCell({ value, onCommit, min = 0, className, ariaLabel }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      min={min}
      className={`input mono${className ? ` ${className}` : ''}`}
      value={draft ?? String(value)}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = Math.max(min, Math.floor(Number(draft ?? value) || 0));
        setDraft(null);
        if (n !== value) onCommit(n);
      }}
    />
  );
}
