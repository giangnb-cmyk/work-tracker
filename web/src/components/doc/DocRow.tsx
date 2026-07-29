import { useState } from 'react';
import { hostOf, providerMeta } from '../../lib/attachments';
import { formatDate } from '../../lib/format';
import { CopyIcon, PencilIcon, PinIcon, TrashIcon } from '../icons';
import ProviderIcon from '../task/ProviderIcon';
import type { ProjectDoc } from '../../types';

interface Props {
  doc: ProjectDoc;
  authorName: string;
  canEdit: boolean;
  pinned: boolean;
  onTogglePin: (doc: ProjectDoc) => void;
  onEdit: (doc: ProjectDoc) => void;
  onDelete: (doc: ProjectDoc) => void;
}

/**
 * Một DÒNG trong chế độ Danh sách của thư viện — cùng props và cùng bộ nút với DocCard
 * (chế độ Thẻ), chỉ khác cách xếp: một hàng ngang cho người thích quét mắt theo danh sách.
 *
 * Dòng phụ ưu tiên GHI CHÚ (lý do tài liệu tồn tại — thứ đáng đọc khi lướt danh sách);
 * không có ghi chú mới rơi về provider · host như trên thẻ, vì icon đứng cạnh vốn đã nói
 * thay nguồn rồi.
 */
export default function DocRow({
  doc,
  authorName,
  canEdit,
  pinned,
  onTogglePin,
  onEdit,
  onDelete,
}: Props) {
  const [copied, setCopied] = useState(false);
  const meta = providerMeta(doc.provider);
  const host = hostOf(doc.url);
  const sub =
    doc.description.trim() || `${meta.label}${host && host !== meta.label ? ` · ${host}` : ''}`;

  function copy() {
    void navigator.clipboard?.writeText(doc.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={`doclib-row${pinned ? ' pinned' : ''}`} title={doc.description || undefined}>
      <a className="doc-body" href={doc.url} target="_blank" rel="noreferrer">
        <span className="doc-icon" aria-hidden><ProviderIcon provider={doc.provider} size={20} /></span>
        <span className="doc-text">
          <span className="doc-name">{doc.name}</span>
          <span className="doc-sub">{sub}</span>
        </span>
      </a>
      {doc.category && <span className="doclib-cat">{doc.category}</span>}
      <span className="doclib-by muted">{authorName} · {formatDate(doc.createdAt)}</span>
      {copied && <span className="doclib-copied">Đã chép</span>}
      <button
        type="button"
        className={`doclib-iconbtn doclib-pin${pinned ? ' on' : ''}`}
        onClick={() => onTogglePin(doc)}
        title={pinned ? 'Bỏ ghim (chỉ ảnh hưởng tới bạn)' : 'Ghim lên đầu — chỉ bạn thấy'}
        aria-pressed={pinned}
      >
        <PinIcon size={14} filled={pinned} />
      </button>
      <button type="button" className="doclib-iconbtn sky" onClick={copy} title="Sao chép link">
        <CopyIcon size={14} />
      </button>
      {canEdit && (
        <>
          <button type="button" className="doclib-iconbtn indigo" onClick={() => onEdit(doc)} title="Sửa tài liệu">
            <PencilIcon size={14} />
          </button>
          <button type="button" className="doclib-iconbtn danger" onClick={() => onDelete(doc)} title="Xoá khỏi thư viện">
            <TrashIcon size={14} />
          </button>
        </>
      )}
    </div>
  );
}
