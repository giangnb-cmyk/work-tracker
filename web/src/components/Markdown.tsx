import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  /** Nguồn Markdown thô (mô tả bug/task — phần lớn đến từ bài post Discord). */
  children: string;
  className?: string;
}

/**
 * Hiển thị Markdown ở chế độ đọc: GFM (bảng, checklist, ~~gạch~~, tự nhận link).
 * react-markdown dựng React node chứ không nhét HTML thô, nên nội dung do người
 * dùng nhập không thể chèn script — không cần sanitize thủ công.
 */
export default function Markdown({ children, className }: Props) {
  return (
    <div className={`md-body${className ? ` ${className}` : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Link trong mô tả luôn mở tab mới — đừng đá người dùng ra khỏi modal.
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
          img: ({ node: _node, ...props }) => <img {...props} loading="lazy" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
