import { useRef, useState } from 'react';
import { makeLinkAttachment } from '../../lib/attachments';
import { docToAttachment } from '../../lib/projectDocWrites';
import AttachmentCard from './AttachmentCard';
import DocPickerModal from '../doc/DocPickerModal';
import type { Attachment, ProjectDoc } from '../../types';

interface Props {
  attachments: Attachment[];
  onChange: (next: Attachment[]) => void;
  disabled: boolean;
  /**
   * Dự án đang mở — bật nút "📚 Thư viện" (chọn từ `project_docs`). Bỏ trống thì chỉ còn
   * đường dán link tay: chỗ hiển thị CHỈ ĐỌC (ref dùng chung của feature) không cần tới nó.
   */
  projectId?: string | null;
}

/**
 * Document links only (Drive/Notion/Discord/Figma/GitHub/…). The provider — and
 * therefore the brand icon on each card — is auto-detected from the pasted URL,
 * so icons only appear once a link is added. Pasted image URLs flow to the Ref
 * section instead (they become image attachments).
 *
 * Hai đường thêm: chọn từ THƯ VIỆN của dự án (tab 📚 Tài liệu — có tên tử tế, dùng lại
 * được nhiều task), hoặc dán URL trần cho thứ chỉ dùng một lần.
 */
export default function AttachmentsField({ attachments, onChange, disabled, projectId }: Props) {
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
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

  /** Gắn các mục vừa chọn; bỏ link đã có (picker đã khoá sẵn, đây là chốt thêm cho chắc). */
  function addFromLibrary(chosen: ProjectDoc[]) {
    const have = new Set(attachments.map((a) => a.url.trim()));
    const fresh = chosen.filter((d) => !have.has(d.url.trim())).map(docToAttachment);
    if (fresh.length > 0) onChange([...attachments, ...fresh]);
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
          <div className="doc-addbar">
            {projectId && (
              <button
                type="button"
                className="doc-addbtn"
                onClick={() => setPicking(true)}
                title="Chọn từ thư viện tài liệu của dự án"
              >
                📚 Thư viện
              </button>
            )}
            <button type="button" className="doc-addbtn" onClick={openAdd}>
              🔗 Dán link
            </button>
          </div>
        )
      )}

      {picking && projectId && (
        <DocPickerModal
          projectId={projectId}
          attachedUrls={attachments.map((a) => a.url)}
          onPick={addFromLibrary}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
