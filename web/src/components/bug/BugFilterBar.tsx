import { useEffect, useMemo, useRef, useState } from 'react';
import { BUG_STATUSES, BUG_STATUS_LABEL, type Bug, type BugLabel, type TeamMember } from '../../types';
import { BUG_STATUS_COLOR } from '../../lib/bugStatus';
import { labelsInGroup } from '../../lib/bugLabelGroups';

export type Facet = 'status' | 'version' | 'label' | 'assignee' | 'reporter';
export interface FilterToken { id: string; facet: Facet; op: 'is' | 'not'; values: string[]; }

interface Opt { value: string; label: string; color?: string; icon?: string; }

const FACETS: { key: Facet; label: string; icon: string }[] = [
  { key: 'status', label: 'Trạng thái', icon: '🚦' },
  { key: 'version', label: 'Version', icon: '🏷️' },
  { key: 'label', label: 'Nhãn', icon: '🔖' },
  { key: 'assignee', label: 'Người nhận', icon: '🙋' },
  { key: 'reporter', label: 'Người báo', icon: '✍️' },
];
const FACET_LABEL: Record<Facet, string> = {
  status: 'Trạng thái', version: 'Version', label: 'Nhãn',
  assignee: 'Người nhận', reporter: 'Người báo',
};

function peopleOpts(members: TeamMember[]): Opt[] {
  return [
    { value: 'none', label: 'Chưa giao' },
    { value: 'any', label: 'Bất kỳ' },
    { value: 'me', label: 'Tôi' },
    ...members.map((m) => ({ value: m.uid, label: m.displayName })),
  ];
}

function labelOpts(labels: BugLabel[]): Opt[] {
  return labels.map((l) => ({ value: l.id, label: l.name, color: l.color, icon: l.icon }));
}

function facetOpts(facet: Facet, labels: BugLabel[], members: TeamMember[]): Opt[] {
  if (facet === 'status') return BUG_STATUSES.map((s) => ({ value: s, label: BUG_STATUS_LABEL[s], color: BUG_STATUS_COLOR[s] }));
  // Version LÀ nhãn — tách facet riêng chỉ để khỏi phải dò tìm '1.0.x' giữa cả rổ nhãn.
  // Mới nhất lên đầu: lọc version gần như luôn là tìm bản vừa build.
  if (facet === 'version') {
    return labelOpts(labelsInGroup(labels, 'version'))
      .sort((a, b) => b.label.localeCompare(a.label, undefined, { numeric: true }));
  }
  if (facet === 'label') return labelOpts(labels);
  return peopleOpts(members);
}

/** Does a bug pass every active filter token? Exported for the list/board. */
export function matchBug(b: Bug, tokens: FilterToken[], meId: string): boolean {
  return tokens.every((t) => {
    if (t.facet === 'status') {
      const has = t.values.includes(b.status);
      return t.op === 'is' ? has : !has;
    }
    if (t.facet === 'label') {
      return t.op === 'is'
        ? t.values.every((v) => b.labelIds.includes(v))
        : t.values.every((v) => !b.labelIds.includes(v));
    }
    // Version cũng là nhãn, nhưng dùng OR chứ không AND: một bug chỉ mang ĐÚNG MỘT version,
    // nên "là 1.0.x, 1.0.y" mà hiểu theo AND thì luôn ra rỗng — vô nghĩa với người dùng.
    if (t.facet === 'version') {
      const any = t.values.some((v) => b.labelIds.includes(v));
      return t.op === 'is' ? any : !any;
    }
    const uid = t.facet === 'assignee' ? b.assigneeId : b.reporterId;
    const one = (v: string) => (v === 'none' ? !uid : v === 'any' ? !!uid : v === 'me' ? uid === meId : uid === v);
    const any = t.values.some(one);
    return t.op === 'is' ? any : !any;
  });
}

interface Props {
  labels: BugLabel[];
  members: TeamMember[];
  tokens: FilterToken[];
  onTokens: (t: FilterToken[]) => void;
  query: string;
  onQuery: (q: string) => void;
}

/** GitLab-style token filter: pick a facet → operator → values → add a token. */
export default function BugFilterBar({ labels, members, tokens, onTokens, query, onQuery }: Props) {
  const [open, setOpen] = useState(false);
  const [facet, setFacet] = useState<Facet | null>(null);
  const [op, setOp] = useState<'is' | 'not'>('is');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) reset(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  function reset() { setOpen(false); setFacet(null); setOp('is'); setPicked(new Set()); }

  const opts = useMemo(() => (facet ? facetOpts(facet, labels, members) : []), [facet, labels, members]);
  const nameOf = useMemo(() => {
    const m = new Map<string, Opt>();
    // Lấy từ FACETS chứ không liệt kê tay: quên thêm facet mới vào đây thì token của nó
    // hiện ra id thô thay vì tên.
    FACETS.forEach(({ key }) =>
      facetOpts(key, labels, members).forEach((o) => m.set(`${key}:${o.value}`, o)));
    return (f: Facet, v: string) => m.get(`${f}:${v}`)?.label ?? v;
  }, [labels, members]);

  function togglePick(v: string) {
    setPicked((s) => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n; });
  }

  function addToken() {
    if (!facet || picked.size === 0) return;
    onTokens([...tokens, { id: crypto.randomUUID(), facet, op, values: [...picked] }]);
    reset();
  }

  return (
    <div className="bugflt">
      <div className="bugflt-bar" ref={wrapRef}>
        <span className="bugflt-search-ic" aria-hidden>🔍</span>
        <input
          className="bugflt-search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Lọc theo tên bug hoặc #số…"
        />
        {tokens.map((t) => (
          <span key={t.id} className="bugflt-token">
            <span className="bugflt-token-facet">{FACET_LABEL[t.facet]}</span>
            <span className="bugflt-token-op">{t.op === 'is' ? 'là' : 'không'}</span>
            <span className="bugflt-token-val">{t.values.map((v) => nameOf(t.facet, v)).join(', ')}</span>
            <button className="bugflt-token-x" onClick={() => onTokens(tokens.filter((x) => x.id !== t.id))} aria-label="Bỏ">×</button>
          </span>
        ))}
        <button className="bugflt-add" onClick={() => (open ? reset() : setOpen(true))}>＋ Lọc</button>

        {open && (
          <div className="bugflt-pop">
            {!facet ? (
              <>
                <div className="bugflt-pop-head">Lọc theo…</div>
                {FACETS.map((f) => (
                  <button key={f.key} className="bugflt-pop-opt" onClick={() => { setFacet(f.key); setPicked(new Set()); setOp('is'); }}>
                    <span>{f.icon}</span>{f.label}
                  </button>
                ))}
              </>
            ) : (
              <>
                <div className="bugflt-pop-head">
                  <button className="bugflt-back" onClick={() => setFacet(null)}>←</button>
                  {FACET_LABEL[facet]}
                </div>
                <div className="bugflt-ops">
                  <button className={`bugflt-op${op === 'is' ? ' on' : ''}`} onClick={() => setOp('is')}>là</button>
                  <button className={`bugflt-op${op === 'not' ? ' on' : ''}`} onClick={() => setOp('not')}>không phải</button>
                </div>
                <div className="bugflt-vals">
                  {opts.map((o) => (
                    <button key={o.value} className={`bugflt-val${picked.has(o.value) ? ' on' : ''}`} onClick={() => togglePick(o.value)}>
                      <span className="bugflt-check">{picked.has(o.value) ? '✓' : ''}</span>
                      {o.icon && <span>{o.icon}</span>}
                      <span style={o.color ? { color: o.color } : undefined}>{o.label}</span>
                    </button>
                  ))}
                </div>
                <button className="bugflt-apply" onClick={addToken} disabled={picked.size === 0}>Thêm bộ lọc</button>
              </>
            )}
          </div>
        )}
      </div>
      {tokens.length > 0 && (
        <button className="btn-sm" onClick={() => onTokens([])}>Xoá lọc</button>
      )}
    </div>
  );
}
