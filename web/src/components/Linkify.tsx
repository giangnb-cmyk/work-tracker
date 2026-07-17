import { Fragment } from 'react';
import { linkify } from '../lib/linkify';

interface Props {
  text: string;
}

/**
 * Chữ do người dùng nhập, có URL thì thành link gạch chân mở tab mới.
 *
 * Vẫn render qua React chứ KHÔNG dựng HTML rồi nhét bằng dangerouslySetInnerHTML: chữ ở
 * đây là dữ liệu người dùng nhập, dựng HTML tay là mở đường cho XSS.
 */
export default function Linkify({ text }: Props) {
  return (
    <>
      {linkify(text).map((seg, i) =>
        seg.href ? (
          <a key={i} className="linkified" href={seg.href} target="_blank" rel="noreferrer noopener">
            {seg.text}
          </a>
        ) : (
          // Khoá theo vị trí: danh sách dựng lại từ `text` mỗi lần render, không xáo trộn.
          <Fragment key={i}>{seg.text}</Fragment>
        ),
      )}
    </>
  );
}
