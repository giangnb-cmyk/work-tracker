import { useCallback, useRef, useState } from 'react';
import { useClickOutside } from '../../hooks/useClickOutside';
import { hostOf, providerMeta } from '../../lib/attachments';
import { formatDate } from '../../lib/format';
import { MoreVerticalIcon } from '../icons';
import ProviderIcon from '../task/ProviderIcon';
import type { ProjectDoc } from '../../types';

interface Props {
  doc: ProjectDoc;
  /** Tên người thêm — tra sẵn ở tab (khỏi mỗi thẻ tự đi tìm trong roster). */
  authorName: string;
  canEdit: boolean;
  onEdit: (doc: ProjectDoc) => void;
  onDelete: (doc: ProjectDoc) => void;
}

/**
 * Một thẻ trong thư viện tài liệu.
 *
 * Cố ý dùng ĐÚNG bộ class của `AttachmentCard` (`.doc-icon` / `.doc-text` / `.doc-name` /
 * `.doc-sub` / `.doc-kebab` / `.doc-menu`): cùng là "một link tài liệu" nên phải nhìn y hệt
 * nhau ở tab thư viện và trong ô Tài liệu của task. Mọi hành động nằm trong menu ⋮ như thẻ
 * kia — trước đây để ba nút emoji rời (⧉ ✏️ 🗑) thì vừa lệch khỏi bộ icon SVG của app, vừa
 * tràn xuống dòng thứ hai trên thẻ hẹp.
 */
export default function DocCard({ doc, authorName, canEdit, onEdit, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(wrapRef, close, open);

  const meta = providerMeta(doc.provider);
  const host = hostOf(doc.url);
  /**
   * Ghi chú + link gộp vào MỘT tooltip của cả thẻ, thay vì in ghi chú ra giữa card: thẻ
   * trong lưới phải cao đều nhau, mà ghi chú dài ngắn khác nhau thì hàng nào cũng lệch.
   * Dùng `title` native — cùng cách với chỗ khác trong app (FeatureModal, AssigneePicker,
   * SubtasksField đều để phần mô tả ở tooltip chứ không nhồi vào ô).
   */
  const tip = [doc.description.trim(), doc.url].filter(Boolean).join('\n\n');

  function copy() {
    void navigator.clipboard?.writeText(doc.url);
    setCopied(true);
    setOpen(false);
    setTimeout(() => setCopied(false), 1500);
  }

  // `title` đặt ở THẺ, không ở thẻ <a>: tooltip native lấy từ tổ tiên gần nhất có title,
  // nhờ đó hover chỗ nào trên card cũng đọc được ghi chú — kể cả vùng chân thẻ.
  return (
    <div className="doclib-card glass" ref={wrapRef} title={tip}>
      <div className="doclib-head">
        <a className="doc-body" href={doc.url} target="_blank" rel="noreferrer">
          <span className="doc-icon" aria-hidden><ProviderIcon provider={doc.provider} size={20} /></span>
          <span className="doc-text">
            <span className="doc-name">{doc.name}</span>
            <span className="doc-sub">{meta.label}{host && host !== meta.label ? ` · ${host}` : ''}</span>
          </span>
        </a>
        <button type="button" className="doc-kebab" onClick={() => setOpen((o) => !o)} title="Tuỳ chọn">
          <MoreVerticalIcon size={16} />
        </button>
        {open && (
          <div className="doc-menu glass">
            <button type="button" onClick={() => { window.open(doc.url, '_blank', 'noreferrer'); setOpen(false); }}>
              ↗ Mở link
            </button>
            <button type="button" onClick={copy}>⧉ Sao chép link</button>
            {canEdit && (
              <>
                <button type="button" onClick={() => { onEdit(doc); setOpen(false); }}>✎ Sửa</button>
                <button type="button" className="danger" onClick={() => { onDelete(doc); setOpen(false); }}>
                  🗑 Xoá khỏi thư viện
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="doclib-foot">
        {doc.category && <span className="doclib-cat">{doc.category}</span>}
        <span className="doclib-by muted">{authorName} · {formatDate(doc.createdAt)}</span>
        {copied && <span className="doclib-copied">Đã chép link</span>}
      </div>
    </div>
  );
}
