import { useState } from 'react';

interface Props {
  value: string;
  onCommit: (s: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

/** Ô nhập chữ sửa-trên-ô: giữ nháp cục bộ, chỉ ghi khi rời ô và nội dung đổi. */
export default function TextCell({ value, onCommit, placeholder, className, ariaLabel }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className={`input${className ? ` ${className}` : ''}`}
      value={draft ?? value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const v = (draft ?? value).trim();
        setDraft(null);
        if (v !== value) onCommit(v);
      }}
    />
  );
}
