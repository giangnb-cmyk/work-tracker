import { useEffect, useMemo, useRef, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string; // '' = nothing selected
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Show a clear/none row at the top. */
  allowEmpty?: boolean;
  emptyLabel?: string;
}

/** Diacritic-insensitive lowercase fold for Vietnamese-friendly matching. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
}

/**
 * A searchable dropdown: open it, type letters and the list jumps/filters to matching
 * options (prefix matches first). Keyboard: ↑/↓ move, Enter picks, Esc closes.
 * Built because a native <select> can't search a long, code-prefixed project list well.
 */
export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Chọn…',
  disabled,
  allowEmpty,
  emptyLabel = '— Không —',
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    const base = q
      ? options
          .filter((o) => fold(o.label).includes(q))
          // prefix matches first, then the rest — so a single letter "jumps" sensibly
          .sort((a, b) => Number(fold(b.label).startsWith(q)) - Number(fold(a.label).startsWith(q)))
      : options;
    return base;
  }, [options, query]);

  // Reset highlight when the filtered set changes.
  useEffect(() => setActive(0), [query, open]);

  // Focus the search box on open.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setQuery('');
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[active];
      if (opt) pick(opt.value);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="ss-wrap" ref={wrapRef}>
      <button
        type="button"
        className="select ss-trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected ? '' : 'muted'}>{selected ? selected.label : placeholder}</span>
        <span className="ss-caret">▾</span>
      </button>

      {open && (
        <div className="ss-panel glass">
          <input
            ref={inputRef}
            className="input ss-search"
            value={query}
            placeholder="Gõ để tìm…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <ul className="ss-list">
            {allowEmpty && !query && (
              <li className="ss-opt" onMouseDown={() => pick('')}>
                <span className="muted">{emptyLabel}</span>
              </li>
            )}
            {filtered.length === 0 ? (
              <li className="ss-empty muted">Không có kết quả.</li>
            ) : (
              filtered.map((o, i) => (
                <li
                  key={o.value}
                  className={`ss-opt${i === active ? ' active' : ''}${o.value === value ? ' selected' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={() => pick(o.value)}
                >
                  {o.label}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
