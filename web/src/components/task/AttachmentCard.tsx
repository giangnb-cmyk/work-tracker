import { useEffect, useRef, useState } from 'react';
import { hostOf, providerMeta } from '../../lib/attachments';
import { MoreVerticalIcon } from '../icons';
import ProviderIcon from './ProviderIcon';
import type { Attachment } from '../../types';

interface Props {
  attachment: Attachment;
  canRemove: boolean;
  onRemove: (id: string) => void;
}

/** One document/link attachment: provider icon · name · host, with a ⋮ menu. */
export default function AttachmentCard({ attachment: a, canRemove, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const meta = providerMeta(a.provider);
  const host = hostOf(a.url);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="doc-card" ref={wrapRef}>
      <a className="doc-body" href={a.url} target="_blank" rel="noreferrer" title={a.url}>
        <span className="doc-icon" aria-hidden><ProviderIcon provider={a.provider} size={20} /></span>
        <span className="doc-text">
          <span className="doc-name">{a.name}</span>
          <span className="doc-sub">{meta.label}{host && host !== meta.label ? ` · ${host}` : ''}</span>
        </span>
      </a>
      <button type="button" className="doc-kebab" onClick={() => setOpen((o) => !o)} title="Tuỳ chọn">
        <MoreVerticalIcon size={16} />
      </button>
      {open && (
        <div className="doc-menu glass">
          <button type="button" onClick={() => { window.open(a.url, '_blank', 'noreferrer'); setOpen(false); }}>
            ↗ Mở link
          </button>
          <button
            type="button"
            onClick={() => { navigator.clipboard?.writeText(a.url); setOpen(false); }}
          >
            ⧉ Sao chép link
          </button>
          {canRemove && (
            <button type="button" className="danger" onClick={() => onRemove(a.id)}>
              🗑 Xoá
            </button>
          )}
        </div>
      )}
    </div>
  );
}
