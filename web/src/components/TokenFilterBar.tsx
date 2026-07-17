import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Thanh lọc kiểu GitLab: chọn facet → toán tử → giá trị → thêm một token.
 *
 * KHÔNG biết gì về bug hay task: nó chỉ nhận danh sách facet và hàm tra option. Miền nào
 * cần lọc thì gói riêng một component mỏng đưa cấu hình vào (xem BugFilterBar,
 * TaskFilterBar) — thêm miền mới là thêm cấu hình chứ không sửa file này.
 *
 * Generic theo `F` để token giữ nguyên kiểu union của từng miền: hàm `match*` bên ngoài
 * còn switch trên `t.facet` và được TypeScript soi, thay vì rơi về `string`.
 */

export interface FilterToken<F extends string = string> {
  id: string;
  facet: F;
  op: 'is' | 'not';
  values: string[];
}

export interface FilterOpt {
  value: string;
  label: string;
  color?: string;
  icon?: string;
}

export interface FacetDef<F extends string> {
  key: F;
  label: string;
  icon: string;
}

interface Props<F extends string> {
  facets: FacetDef<F>[];
  /** Các lựa chọn của một facet. Phải ổn định theo deps của phía gọi (useCallback). */
  optsOf: (facet: F) => FilterOpt[];
  tokens: FilterToken<F>[];
  onTokens: (t: FilterToken<F>[]) => void;
  query: string;
  onQuery: (q: string) => void;
  placeholder: string;
}

export default function TokenFilterBar<F extends string>({
  facets,
  optsOf,
  tokens,
  onTokens,
  query,
  onQuery,
  placeholder,
}: Props<F>) {
  const [open, setOpen] = useState(false);
  const [facet, setFacet] = useState<F | null>(null);
  const [op, setOp] = useState<'is' | 'not'>('is');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) reset();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  function reset() {
    setOpen(false);
    setFacet(null);
    setOp('is');
    setPicked(new Set());
  }

  const opts = useMemo(() => (facet ? optsOf(facet) : []), [facet, optsOf]);
  const facetLabel = useMemo(() => {
    const m = new Map(facets.map((f) => [f.key, f.label]));
    return (f: F) => m.get(f) ?? f;
  }, [facets]);
  const nameOf = useMemo(() => {
    // Duyệt từ `facets` chứ không liệt kê tay: quên thêm facet mới vào đây thì token của
    // nó hiện ra id thô thay vì tên.
    const m = new Map<string, FilterOpt>();
    facets.forEach(({ key }) => optsOf(key).forEach((o) => m.set(`${key}:${o.value}`, o)));
    return (f: F, v: string) => m.get(`${f}:${v}`)?.label ?? v;
  }, [facets, optsOf]);

  function togglePick(v: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(v)) n.delete(v);
      else n.add(v);
      return n;
    });
  }

  function addToken() {
    if (!facet || picked.size === 0) return;
    onTokens([...tokens, { id: crypto.randomUUID(), facet, op, values: [...picked] }]);
    reset();
  }

  return (
    <div className="tokflt">
      <div className="tokflt-bar" ref={wrapRef}>
        <span className="tokflt-search-ic" aria-hidden>🔍</span>
        <input
          className="tokflt-search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
        />
        {tokens.map((t) => (
          <span key={t.id} className="tokflt-token">
            <span className="tokflt-token-facet">{facetLabel(t.facet)}</span>
            <span className="tokflt-token-op">{t.op === 'is' ? 'là' : 'không'}</span>
            <span className="tokflt-token-val">{t.values.map((v) => nameOf(t.facet, v)).join(', ')}</span>
            <button
              className="tokflt-token-x"
              onClick={() => onTokens(tokens.filter((x) => x.id !== t.id))}
              aria-label="Bỏ"
            >
              ×
            </button>
          </span>
        ))}
        <button className="tokflt-add" onClick={() => (open ? reset() : setOpen(true))}>＋ Lọc</button>

        {open && (
          <div className="tokflt-pop">
            {!facet ? (
              <>
                <div className="tokflt-pop-head">Lọc theo…</div>
                {facets.map((f) => (
                  <button
                    key={f.key}
                    className="tokflt-pop-opt"
                    onClick={() => { setFacet(f.key); setPicked(new Set()); setOp('is'); }}
                  >
                    <span>{f.icon}</span>{f.label}
                  </button>
                ))}
              </>
            ) : (
              <>
                <div className="tokflt-pop-head">
                  <button className="tokflt-back" onClick={() => setFacet(null)}>←</button>
                  {facetLabel(facet)}
                </div>
                <div className="tokflt-ops">
                  <button className={`tokflt-op${op === 'is' ? ' on' : ''}`} onClick={() => setOp('is')}>là</button>
                  <button className={`tokflt-op${op === 'not' ? ' on' : ''}`} onClick={() => setOp('not')}>không phải</button>
                </div>
                <div className="tokflt-vals">
                  {opts.map((o) => (
                    <button
                      key={o.value}
                      className={`tokflt-val${picked.has(o.value) ? ' on' : ''}`}
                      onClick={() => togglePick(o.value)}
                    >
                      <span className="tokflt-check">{picked.has(o.value) ? '✓' : ''}</span>
                      {o.icon && <span>{o.icon}</span>}
                      <span style={o.color ? { color: o.color } : undefined}>{o.label}</span>
                    </button>
                  ))}
                </div>
                <button className="tokflt-apply" onClick={addToken} disabled={picked.size === 0}>
                  Thêm bộ lọc
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {tokens.length > 0 && <button className="btn-sm" onClick={() => onTokens([])}>Xoá lọc</button>}
    </div>
  );
}
