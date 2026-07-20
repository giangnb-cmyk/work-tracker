import { lazy, type ComponentType } from 'react';

/**
 * Chống lỗi "Failed to fetch dynamically imported module" sau khi deploy bản mới.
 *
 * Tab đang mở giữ index.html CŨ, trong đó tên chunk có hash cũ
 * (`assets/Features-YoypIu3L.js`). Deploy mới sinh hash khác và xoá file cũ khỏi
 * CDN — nên lần đầu người dùng bấm sang một tab lazy, import() vỡ. Cách chữa duy
 * nhất đúng là nạp lại trang để lấy index.html mới (trỏ tới hash mới).
 */

const RELOAD_KEY = 'chunkReloadAt';
/** Đã reload trong khoảng này thì KHÔNG reload nữa — nếu chunk hỏng thật, reload
 *  lại cũng vỡ y hệt và ta sẽ rơi vào vòng lặp nạp trang vô tận. */
const RELOAD_COOLDOWN_MS = 30_000;

function readLastReload(): number {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
  } catch {
    // Safari private mode / cookie bị chặn: coi như chưa từng reload.
    return 0;
  }
}

/**
 * Nạp lại trang một lần để lấy bundle mới. Trả về `false` nếu vừa reload xong
 * (lỗi không phải do stale deploy) để phía gọi còn ném lỗi ra cho người dùng thấy.
 */
export function reloadForNewDeploy(): boolean {
  if (Date.now() - readLastReload() < RELOAD_COOLDOWN_MS) return false;
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* không lưu được thì thôi, vẫn reload — cooldown chỉ là lớp chống lặp */
  }
  window.location.reload();
  return true;
}

/** Lỗi nạp chunk (mất file trên CDN) chứ không phải lỗi trong chính component. */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return /dynamically imported module|Importing a module script failed|Failed to fetch|error loading dynamically imported module|expected a javascript/i.test(
    msg,
  );
}

/**
 * `React.lazy` nhưng tự nạp lại trang khi chunk đã bị deploy mới xoá.
 * Dùng thay cho `lazy()` ở mọi view code-split.
 */
export function lazyView<T extends ComponentType<any>>(loader: () => Promise<{ default: T }>) {
  return lazy(() =>
    loader().catch((err: unknown) => {
      if (isChunkLoadError(err) && reloadForNewDeploy()) {
        // Trang đang được nạp lại; trả promise treo để React không kịp render lỗi.
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }),
  );
}

/**
 * Bắt `vite:preloadError` — Vite bắn sự kiện này khi một chunk phụ thuộc
 * (modulepreload) tải hỏng, trước cả khi promise của import() reject. Không chặn
 * ở đây thì lỗi nổi lên thành "Uncaught TypeError" ngoài tầm với của React.
 */
export function installChunkErrorGuard(): void {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForNewDeploy()) event.preventDefault();
  });
}
