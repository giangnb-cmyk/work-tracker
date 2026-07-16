// useStoredView — nhớ kiểu xem của một trang qua các lần vào web.
//
// Đây là SỞ THÍCH cá nhân, không phải trạng thái phiên: localStorage chứ không phải
// context. Không đồng bộ giữa các máy — cố ý, một cột trong DB cho việc này là quá đắt.

import { useCallback, useState } from 'react';

/** localStorage ném lỗi khi bị chặn cookie/bên thứ ba. Mất sở thích thì thôi, đừng trắng màn hình. */
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Không lưu được thì lần sau về mặc định — không đáng để làm phiền người dùng.
  }
}

/**
 * Kiểu xem đã lưu, kèm hàm chọn (tự ghi lại).
 *
 * `allowed` là bộ lọc, không phải trang trí: giá trị cũ còn sót trong localStorage từ bản
 * trước (vd 'gallery' sau khi bỏ chế độ đó) phải rơi về `fallback` thay vì lọt vào state.
 */
export function useStoredView<T extends string>(key: string, allowed: readonly T[], fallback: T) {
  const [view, setView] = useState<T>(() => {
    const saved = readStored(key);
    return allowed.includes(saved as T) ? (saved as T) : fallback;
  });

  const select = useCallback(
    (next: T) => {
      writeStored(key, next);
      setView(next);
    },
    [key],
  );

  return [view, select] as const;
}
