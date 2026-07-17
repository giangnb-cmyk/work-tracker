// Generic "fetch + subscribe" hook: runs a Supabase query, then re-runs it whenever
// the table emits a realtime change (RLS-filtered). Simple and correct for the modest
// row counts here — no manual cache patching to get subtly wrong.

import { useEffect, useId, useState } from 'react';
import { supabase } from '../supabase';

/**
 * Gom các event realtime dồn dập thành MỘT lần refetch. Bot sync Discord update hàng
 * trăm bug trong một lượt — không gom thì mỗi event là một lần tải lại NGUYÊN bảng
 * (đã đo qua pg_stat_statements: 216 lần × ~49ms chỉ riêng bảng bugs). 300ms im ắng
 * là đủ coi như một đợt ghi hàng loạt đã xong.
 */
const REFETCH_DEBOUNCE_MS = 300;
/**
 * Trần chờ khi event đến liên tục không ngớt: debounce thuần sẽ hoãn mãi cho tới khi
 * đợt sync dài kết thúc, UI ôm dữ liệu cũ suốt. Quá ngưỡng này thì cứ refetch một nhịp.
 */
const REFETCH_MAX_WAIT_MS = 2000;

interface Options<T> {
  /** Table to watch for realtime changes. */
  table: string;
  /** Runs the select + maps rows to T[]. Must be stable per `deps`. */
  fetcher: () => Promise<T[]>;
  /** Postgres realtime filter, e.g. `sprint_id=eq.<id>`. Omit to watch the whole table. */
  filter?: string;
  /** Re-subscribe/re-fetch when these change. */
  deps: unknown[];
  /** When false, skip (returns [] , not loading). */
  enabled?: boolean;
}

export function useLiveQuery<T>({ table, fetcher, filter, deps, enabled = true }: Options<T>) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  /**
   * Định danh riêng cho MỖI instance hook, nhét vào tên channel.
   *
   * Không có nó thì hai chỗ cùng watch một table với cùng filter sẽ sinh ra hai channel
   * TRÙNG TOPIC (`live:profiles:all`), và hai channel cùng topic subscribe song song là
   * hỏng realtime — Supabase còn retry liên tục nên lỗi nổ ra không dứt. Đã cắn thật ở
   * tab Cấu hình (MemberDmTest gọi useMembers trong khi SprintContext đã gọi).
   *
   * Trước đây chỉ có comment nhắc "đừng subscribe hai lần" — mà nhắc suông thì người sau
   * vẫn dẫm phải. Tên duy nhất biến chuyện đó thành vô hại ngay từ trong hook.
   */
  const instanceId = useId();

  useEffect(() => {
    if (!enabled) {
      setData([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);

    // Hai fetch bay song song (refetch chồng lên nhau) có thể về LỆCH thứ tự —
    // đánh số từng lần chạy, chỉ nhận kết quả của lần mới nhất.
    let runSeq = 0;
    const run = () => {
      const seq = ++runSeq;
      return fetcher()
        .then((rows) => {
          if (alive && seq === runSeq) {
            setData(rows);
            setLoading(false);
          }
        })
        .catch((err) => {
          console.error(`useLiveQuery(${table}) tải dữ liệu thất bại`, err);
          if (alive && seq === runSeq) setLoading(false);
        });
    };

    void run();

    // Debounce trailing + trần chờ (xem hằng số ở đầu file).
    let timer: ReturnType<typeof setTimeout> | undefined;
    let firstQueuedAt = 0;
    const scheduleRun = () => {
      const now = Date.now();
      if (!firstQueuedAt) firstQueuedAt = now;
      clearTimeout(timer);
      const delay = Math.max(0, Math.min(REFETCH_DEBOUNCE_MS, firstQueuedAt + REFETCH_MAX_WAIT_MS - now));
      timer = setTimeout(() => {
        firstQueuedAt = 0;
        void run();
      }, delay);
    };

    const channel = supabase
      .channel(`live:${table}:${filter ?? 'all'}:${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        scheduleRun,
      )
      .subscribe();

    return () => {
      alive = false;
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading };
}
