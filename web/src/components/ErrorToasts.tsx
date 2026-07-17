import type { AppError } from '../types';

interface ErrorToastsProps {
  /** Chỉ những lỗi còn trong hạn hiện toast — ErrorCenter lọc sẵn. */
  toasts: AppError[];
  onDismiss: (id: string) => void;
  onOpenList: () => void;
}

/** Toast lỗi ở góc dưới bên phải. Mới nhất nằm dưới cùng, sát tầm mắt. */
export default function ErrorToasts({ toasts, onDismiss, onOpenList }: ErrorToastsProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="errlog-toasts">
      {/* Đảo thứ tự: state giữ mới-nhất-trước, nhưng xếp chồng thì cái mới phải ở đáy. */}
      {[...toasts].reverse().map((e) => (
        <div key={e.id} className="errlog-toast glass" role="alert">
          <span className="errlog-toast-icon">⚠</span>
          <div className="errlog-toast-body">
            <span className="errlog-src">{e.source}</span>
            <p className="errlog-toast-msg">{e.message}</p>
            {e.note && <p className="errlog-note">{e.note}</p>}
            <button type="button" className="errlog-toast-link" onClick={onOpenList}>
              Xem tất cả lỗi →
            </button>
          </div>
          <button
            type="button"
            className="errlog-toast-x"
            onClick={() => onDismiss(e.id)}
            aria-label="Đóng thông báo lỗi"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
