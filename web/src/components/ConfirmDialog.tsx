import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';

interface Props {
  title: string;
  /** Câu hỏi chính. Ngắn, nói rõ cái gì sắp mất. */
  message: ReactNode;
  /** Hệ quả kèm theo mà người dùng không đoán được (vd: xoá cả bên Notion). */
  detail?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Hộp xác nhận cho thao tác phá huỷ — thay `window.confirm`, vốn là hộp trắng của trình
 * duyệt, lạc hẳn khỏi theme và không nói được hệ quả kèm theo.
 *
 * Tự quản lý trạng thái "đang chạy": onConfirm thường là một lệnh xoá qua mạng, mà nút
 * không khoá thì người dùng bấm hai lần là gửi hai lệnh xoá.
 */
export default function ConfirmDialog({
  title,
  message,
  detail,
  confirmLabel = 'Xoá',
  cancelLabel = 'Huỷ',
  onConfirm,
  onCancel,
}: Props) {
  const [busy, setBusy] = useState(false);

  // Esc để thoát — hộp thoại phá huỷ phải luôn có đường lùi bằng bàn phím.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  async function run() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      // Component có thể đã unmount sau khi xoá xong; set state lúc đó là no-op ở React 18.
      setBusy(false);
    }
  }

  // TaskModal/BugModal render hộp này BÊN TRONG overlay của chúng, mà overlay đó đóng modal
  // khi bị click. Không chặn nổi bọt thì bấm ra nền để huỷ xoá sẽ đóng luôn cả task modal.
  function cancelFromBackdrop(e: MouseEvent) {
    e.stopPropagation();
    if (!busy) onCancel();
  }

  return (
    <div className="modal-overlay confirm-overlay" onClick={cancelFromBackdrop}>
      <div className="modal confirm-modal" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-head">
          <span className="confirm-ic" aria-hidden>⚠️</span>
          <h2>{title}</h2>
        </div>
        <p className="confirm-msg">{message}</p>
        {detail && <p className="confirm-detail muted">{detail}</p>}
        <div className="modal-actions">
          <button className="btn-sm" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button className="btn-sm btn-danger" onClick={run} disabled={busy} autoFocus>
            {busy ? 'Đang xoá…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
