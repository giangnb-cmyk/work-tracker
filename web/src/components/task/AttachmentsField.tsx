import { useRef, useState } from 'react';
import { makeLinkAttachment } from '../../lib/attachments';
import AttachmentCard from './AttachmentCard';
import type { Attachment } from '../../types';

interface Props {
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
  disabled: boolean;
}

/**
 * Document links only (Drive/Notion/Discord/Figma/GitHub/…). The provider — and
 * therefore the brand icon on each card — is auto-detected from the pasted URL,
 * so icons only appear once a link is added. Pasted image URLs flow to the Ref
 * section instead (they become image attachments).
 */
export default function AttachmentsField({ attachments, onChange, disabled }: Props) {
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const docs = attachments.filter((a) => a.kind !== 'image');

  function openAdd() {
    setAdding(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function addLink() {
    const trimmed = url.trim();
    if (!trimmed) return;
    onChange([...attachments, makeLinkAttachment(trimmed)]);
    setUrl('');
    inputRef.current?.focus();
  }

  function remove(id: string) {
    onChange(attachments.filter((a) => a.id !== id));
  }

  return (
    <div className="doc-field">
      {docs.length > 0 && (
        <div className="doc-list">
          {docs.map((a) => (
            <AttachmentCard key={a.id} attachment={a} canRemove={!disabled} onRemove={remove} />
          ))}
        </div>
      )}

      {docs.length === 0 && disabled && <p className="st-empty">Chưa có tài liệu.</p>}

      {!disabled && (
        adding ? (
          <div className="doc-addrow">
            <input
              ref={inputRef}
              className="input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); addLink(); }
                if (e.key === 'Escape') { setAdding(false); setUrl(''); }
              }}
              placeholder="Dán link Drive / Notion / Discord / Figma / GitHub…"
            />
            <button type="button" className="btn-sm" onClick={addLink}>Thêm</button>
          </div>
        ) : (
          <button type="button" className="doc-addbtn" onClick={openAdd}>
            🔗 Thêm tài liệu / dán link
          </button>
        )
      )}
    </div>
  );
}
