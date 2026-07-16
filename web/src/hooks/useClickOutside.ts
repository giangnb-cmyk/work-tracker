import { useEffect, type RefObject } from 'react';

/**
 * Gọi `onOutside` khi bấm chuột NGOÀI phần tử `ref` — cách đóng dropdown/popup chuẩn
 * của app (SearchableSelect, BugFilterBar… cùng kiểu). ĐỪNG đóng bằng backdrop
 * `position: fixed`: tổ tiên có backdrop-filter (mọi thẻ .glass, .topbar) trở thành
 * containing block và nhốt backdrop vào trong nó — backdrop không phủ nổi cả trang,
 * bấm ngoài vùng đó sẽ không đóng được.
 *
 * `onOutside` nên là useCallback-stable để không phải gỡ/gắn listener mỗi render.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onOutside: () => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [ref, onOutside, enabled]);
}
