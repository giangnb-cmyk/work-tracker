// useOptimisticList — lớp "ghi lạc quan" mỏng phủ lên dữ liệu server của useLiveQuery.
//
// Vấn đề: các ô nhập của tab Chi phí là controlled theo dữ liệu server, nên một cú tick phải
// đi hết vòng ghi → realtime dội về → debounce 300ms → refetch cả bảng rồi mới hiện (~1s trên
// mạng thật). Checkbox bấm xong đứng im, giá trị vừa gõ còn nhảy về số cũ rồi mới nhảy lại —
// nhìn như web bị giật. Lớp này đổi local NGAY, ghi nền; server vẫn là nguồn sự thật: lượt
// ghi cuối xong (kể cả LỖI) là refetch một nhịp để chốt lại — ghi hỏng thì local tự lăn về
// đúng dữ liệu server, không cần hoàn tác tay.

import { useCallback, useEffect, useRef, useState } from 'react';

export function useOptimisticList<T extends { id: string }>(
  server: T[],
  refetch: () => Promise<void>,
) {
  const [rows, setRows] = useState<T[]>(server);
  /** Số lượt ghi đang bay — trong ref vì chỉ để QUYẾT ĐỊNH, không cần render lại. */
  const pendingRef = useRef(0);

  // Nhận dữ liệu server CHỈ khi yên ắng: refetch của lượt ghi TRƯỚC (chưa mang thay đổi
  // đang bay) mà đè vào là thao tác người dùng vừa làm biến mất một nhịp rồi hiện lại.
  useEffect(() => {
    if (pendingRef.current === 0) setRows(server);
  }, [server]);

  /** Bao một lượt ghi: đếm pending; lượt CUỐI xong thì refetch chốt sổ (cả khi lỗi). */
  const track = useCallback(
    async (write: () => Promise<void>) => {
      pendingRef.current += 1;
      try {
        await write();
      } finally {
        pendingRef.current -= 1;
        if (pendingRef.current === 0) void refetch();
      }
    },
    [refetch],
  );

  /** Sửa/xoá lạc quan: đổi local ngay rồi ghi nền. Lỗi → refetch ở track tự hoàn tác. */
  const mutate = useCallback(
    (apply: (prev: T[]) => T[], write: () => Promise<void>): Promise<void> => {
      setRows(apply);
      return track(write);
    },
    [track],
  );

  /**
   * Thêm dòng: đợi server trả dòng thật (có id) rồi gắn vào local — MỘT vòng mạng thay vì
   * chờ nguyên chuỗi realtime+debounce+refetch. Chặn trùng id phòng refetch về trước.
   */
  const create = useCallback(
    (write: () => Promise<T | T[]>): Promise<void> =>
      track(async () => {
        const created = await write();
        const list = Array.isArray(created) ? created : [created];
        setRows((prev) => [...prev, ...list.filter((c) => !prev.some((r) => r.id === c.id))]);
      }),
    [track],
  );

  return { rows, mutate, create };
}
