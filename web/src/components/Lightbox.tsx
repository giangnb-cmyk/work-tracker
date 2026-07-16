import { useEffect, type MouseEvent } from 'react';

interface Props {
  url: string;
  /** Tên hiển thị dưới ảnh. Bỏ trống thì không hiện dòng nào. */
  name?: string;
  onClose: () => void;
}

/**
 * Xem ảnh cỡ lớn ngay trong app. Bấm nền hoặc Esc để đóng; bấm vào chính ảnh thì không.
 *
 * Chặn nổi bọt ở nền: modal (task/bug) render lightbox BÊN TRONG overlay của nó, mà
 * overlay đó đóng modal khi bị click — không chặn thì bấm ra nền để tắt ảnh sẽ đóng luôn
 * cả modal bên dưới.
 */
export default function Lightbox({ url, name, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function closeFromBackdrop(e: MouseEvent) {
    e.stopPropagation();
    onClose();
  }

  return (
    <div className="lightbox" onClick={closeFromBackdrop}>
      <img src={url} alt={name ?? ''} onClick={(e) => e.stopPropagation()} />
      {name && <span className="lightbox-name mono">{name}</span>}
    </div>
  );
}
