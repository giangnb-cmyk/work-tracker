import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  /** Chiều cao tối đa khi thu gọn (px). */
  maxHeight?: number;
  className?: string;
  children: ReactNode;
}

/** Dưới ngưỡng này thì cắt cũng chẳng lộ ra gì — đừng bắt người dùng bấm thêm một nút. */
const SLACK_PX = 12;

/**
 * Thu gọn nội dung dài về `maxHeight` kèm nút "Xem thêm".
 *
 * Nút CHỈ hiện khi nội dung thật sự bị cắt: đo phần tử bên trong (chiều cao tự nhiên,
 * không bị kẹp) chứ không đo khung ngoài — khung ngoài khi thu gọn luôn đúng bằng
 * maxHeight nên không nói lên điều gì.
 */
export default function CollapsibleBox({ maxHeight = 220, className, children }: Props) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setOverflows(el.offsetHeight > maxHeight + SLACK_PX);
    measure();
    // Ảnh trong mô tả load xong là chiều cao nhảy — không đo lại thì mô tả toàn ảnh
    // sẽ không bao giờ mọc ra nút "Xem thêm".
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [maxHeight]);

  const clamped = overflows && !expanded;

  return (
    <div className={`clp${className ? ` ${className}` : ''}`}>
      <div className={`clp-body${clamped ? ' clp-clamped' : ''}`} style={clamped ? { maxHeight } : undefined}>
        <div ref={innerRef}>{children}</div>
      </div>
      {overflows && (
        <button type="button" className="clp-more" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? 'Thu gọn ▲' : 'Xem thêm ▼'}
        </button>
      )}
    </div>
  );
}
