import { useCallback, useEffect, useMemo, useState } from 'react';
import { reportError, subscribeErrors } from '../lib/errorBus';
import ErrorToasts from './ErrorToasts';
import ErrorPanel from './ErrorPanel';
import type { AppError } from '../types';

/** Giữ tối đa ngần này lỗi trong nhật ký; cũ hơn thì rụng. */
const MAX_KEPT = 50;
/** Số toast hiện cùng lúc — nhiều hơn là che mất app. */
const MAX_TOASTS = 3;
/** Toast tự tắt sau ngần này ms (lỗi vẫn nằm trong nhật ký). */
const TOAST_MS = 8000;

/**
 * Trung tâm lỗi: toast góc dưới phải + ngăn kéo nhật ký trượt từ mép phải.
 *
 * Mount MỘT lần ở App, ngoài mọi cổng đăng nhập/chọn dự án, để lỗi lúc đang đăng nhập
 * cũng hiện được. Không dùng context: nơi sinh lỗi gọi thẳng `reportError` của bus (hàm
 * thuần, không cần React), nên chẳng ai cần đọc state này ngoài chính nó.
 */
export default function ErrorCenter() {
  const [errors, setErrors] = useState<AppError[]>([]);
  const [toastIds, setToastIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(
    () =>
      subscribeErrors((e) => {
        setErrors((prev) => [e, ...prev].slice(0, MAX_KEPT));
        setToastIds((prev) => [e.id, ...prev].slice(0, MAX_TOASTS));
        // Hẹn giờ theo từng lỗi: mỗi toast sống đúng TOAST_MS kể từ lúc NÓ hiện ra, thay
        // vì cùng rụng một lượt. ErrorCenter sống suốt vòng đời app nên không cần huỷ.
        setTimeout(() => setToastIds((prev) => prev.filter((id) => id !== e.id)), TOAST_MS);
      }),
    [],
  );

  // Lỗi không ai bắt: throw ngoài try/catch và promise reject bị bỏ quên. Không hứng ở
  // đây thì chúng chỉ nằm im trong Console — đúng thứ không ai mở ra lúc đang dùng app.
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportError('Trang web', e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => reportError('Promise chưa bắt', e.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const openList = useCallback(() => {
    setOpen(true);
    setToastIds([]); // Mở danh sách rồi thì toast thành thừa.
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToastIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const clearAll = useCallback(() => {
    setErrors([]);
    setToastIds([]);
  }, []);

  const toasts = useMemo(() => errors.filter((e) => toastIds.includes(e.id)), [errors, toastIds]);

  return (
    <>
      {/* Nút mở nhật ký chỉ hiện khi ĐÃ có lỗi: không có lỗi thì nó chỉ là rác trên màn
          hình. Ẩn luôn lúc panel đang mở để khỏi đè lên chính panel. */}
      {errors.length > 0 && !open && (
        <button
          type="button"
          className="errlog-fab"
          onClick={openList}
          title={`${errors.length} lỗi trong phiên này`}
        >
          ⚠ <span className="mono">{errors.length}</span>
        </button>
      )}
      <ErrorToasts toasts={toasts} onDismiss={dismissToast} onOpenList={openList} />
      <ErrorPanel errors={errors} open={open} onClose={() => setOpen(false)} onClear={clearAll} />
    </>
  );
}
