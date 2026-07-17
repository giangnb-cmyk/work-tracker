// Kênh báo lỗi dùng chung. Observer: nơi sinh lỗi chỉ gọi `reportError` và không cần
// biết ai hiển thị nó.
//
// Ở tầng lib CỐ Ý không đụng React: `taskWrites`/`notionSync`… là hàm thuần, gọi được từ
// ngoài component nên không dùng hook được. Bus là module-level, ai cũng gọi được; phần
// React chỉ việc subscribe (xem components/ErrorCenter.tsx).

import type { AppError } from '../types';

type Listener = (e: AppError) => void;

const listeners = new Set<Listener>();
let seq = 0;

/** Bóc câu người đọc được ra khỏi thứ bất kỳ mà catch() bắt được. */
function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  // Supabase trả { message, details, hint, code } — object thường, KHÔNG phải Error.
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return 'Lỗi không rõ nguyên nhân.';
}

/** Phần chi tiết để xem trong panel: stack với Error, JSON với lỗi dạng object. */
function toDetail(err: unknown): string | undefined {
  if (err instanceof Error) return err.stack;
  if (err && typeof err === 'object') {
    try {
      return JSON.stringify(err, null, 2);
    } catch {
      return undefined; // object có vòng lặp tham chiếu — bỏ qua, message vẫn còn.
    }
  }
  return undefined;
}

/**
 * Báo một lỗi cho UI. Gọi được từ mọi nơi, kể cả ngoài React.
 *
 * Vẫn console.error như cũ: panel chỉ giữ 50 lỗi gần nhất và mất khi F5, còn console là
 * thứ dev mở ra khi cần đào sâu.
 *
 * @param source Nhóm hiển thị trên nhãn, vd 'Notion', 'Task'.
 * @param note   Ngữ cảnh trấn an, vd 'Task vẫn đã lưu.' — xem AppError.note.
 */
export function reportError(source: string, err: unknown, note?: string): void {
  seq += 1;
  const entry: AppError = {
    id: `${Date.now()}-${seq}`,
    source,
    message: toMessage(err),
    note,
    detail: toDetail(err),
    at: new Date(),
  };
  console.error(`[${source}]`, err);
  for (const fn of listeners) fn(entry);
}

/** Đăng ký nhận lỗi. Trả về hàm huỷ đăng ký (dùng trong cleanup của useEffect). */
export function subscribeErrors(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
