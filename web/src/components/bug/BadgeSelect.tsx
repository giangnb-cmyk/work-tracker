import { useEffect, useRef, useState, type CSSProperties } from 'react';

export interface BadgeOption {
  value: string;
  label: string;
  color?: string;
  icon?: string;
}

interface Props {
  value: string;
  options: BadgeOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/** A colored pill that opens a dropdown — the header Severity/Status badges. */
export default function BadgeSelect({ value, options, onChange, disabled, placeholder = '—' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const cur = options.find((o) => o.value === value);
  const color = cur?.color || '#94a3b8';

  return (
    <div className="badge-sel" ref={ref}>
      <button
        type="button"
        className={`badge-sel-btn${open ? ' open' : ''}`}
        style={{ '--c': color } as CSSProperties}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {cur?.icon && <span className="badge-sel-ic">{cur.icon}</span>}
        <span>{cur ? cur.label : placeholder}</span>
        {!disabled && <span className="badge-sel-caret">▾</span>}
      </button>
      {open && (
        <div className="badge-sel-pop">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`badge-sel-opt${o.value === value ? ' on' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.icon && <span>{o.icon}</span>}
              <span style={{ color: o.color }}>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
