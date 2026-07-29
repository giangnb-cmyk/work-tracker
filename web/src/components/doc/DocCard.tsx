import { useState } from 'react';
import { hostOf, providerMeta } from '../../lib/attachments';
import { formatDate } from '../../lib/format';
import { CopyIcon, PencilIcon, PinIcon, TrashIcon } from '../icons';
import ProviderIcon from '../task/ProviderIcon';
import type { ProjectDoc } from '../../types';

interface Props {
  doc: ProjectDoc;
  /** Tên người thêm — tra sẵn ở tab (khỏi mỗi thẻ tự đi tìm trong roster). */
  authorName: string;
  canEdit: boolean;
  /** Đang ghim bởi CHÍNH người đang đăng nhập (ghim là riêng từng người). */
  pinned: boolean;
  onTogglePin: (doc: ProjectDoc) => void;
  onEdit: (doc: ProjectDoc) => void;
  onDelete: (doc: ProjectDoc) => void;
}

/**
 * Một thẻ trong thư viện tài liệu.
 *
 * Phần đầu thẻ dùng ĐÚNG bộ class của `AttachmentCard` (`.doc-icon` / `.doc-text` /
 * `.doc-name` / `.doc-sub`): cùng là "một link tài liệu" nên phải nhìn y hệt nhau ở tab
 * thư viện và trong ô Tài liệu của task.
 *
 * Hành động để NÚT RỜI (không gom vào menu ⋮) trên một hàng riêng ở chân thẻ: sao chép /
 * sửa / xoá đều là thao tác một-cú-bấm, nhét vào menu là thêm một cú bấm cho mọi lần dùng.
 * Hàng riêng chứ không chen cùng nhóm+tác giả vì thẻ hẹp 300px sẽ tràn xuống dòng lộn xộn.
 */
export default function DocCard({
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

  function copy() {
    void navigator.clipboard?.writeText(doc.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={`doclib-card glass${pinned ? ' pinned' : ''}`}>
      <div className="doclib-head">
        <a className="doc-body" href={doc.url} target="_blank" rel="noreferrer" title={doc.url}>
          <span className="doc-icon" aria-hidden><ProviderIcon provider={doc.provider} size={20} /></span>
          <span className="doc-text">
            <span className="doc-name">{doc.name}</span>
            <span className="doc-sub">{meta.label}{host && host !== meta.label ? ` · ${host}` : ''}</span>
          </span>
        </a>
        {/* Ghim đứng riêng ở đầu thẻ (không xuống hàng hành động): nó là TRẠNG THÁI cần
            thấy ngay, không phải một lệnh nữa trong danh sách lệnh. */}
        <button
          type="button"
          className={`doclib-iconbtn doclib-pin${pinned ? ' on' : ''}`}
          onClick={() => onTogglePin(doc)}
          title={pinned ? 'Bỏ ghim (chỉ ảnh hưởng tới bạn)' : 'Ghim lên đầu — chỉ bạn thấy'}
          aria-pressed={pinned}
        >
          <PinIcon size={15} filled={pinned} />
        </button>
      </div>

      {/* Ghi chú: mặc định ĐÚNG MỘT DÒNG, dài hơn thì cắt "…"; hover vào thẻ mới xổ hết.
          Vỏ .doclib-descwrap luôn chiếm đúng một dòng và phần chữ nằm absolute trong đó —
          nhờ vậy lúc xổ ra nó ĐÈ LÊN chân thẻ chứ không nong thẻ cao lên, tránh cả hàng
          trong lưới giật lên giật xuống mỗi lần trỏ chuột đi ngang. */}
      {doc.description && (
        <div className="doclib-descwrap">
          <p className="doclib-desc">{doc.description}</p>
        </div>
      )}

      <div className="doclib-foot">
        {doc.category && <span className="doclib-cat">{doc.category}</span>}
        <span className="doclib-by muted">{authorName} · {formatDate(doc.createdAt)}</span>
      </div>

      <div className="doclib-actions">
        {copied && <span className="doclib-copied">Đã chép link</span>}
        <button type="button" className="doclib-iconbtn sky" onClick={copy} title="Sao chép link">
          <CopyIcon size={15} />
        </button>
        {canEdit && (
          <>
            <button type="button" className="doclib-iconbtn indigo" onClick={() => onEdit(doc)} title="Sửa tài liệu">
              <PencilIcon size={15} />
            </button>
            <button
              type="button"
              className="doclib-iconbtn danger"
              onClick={() => onDelete(doc)}
              title="Xoá khỏi thư viện"
            >
              <TrashIcon size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
