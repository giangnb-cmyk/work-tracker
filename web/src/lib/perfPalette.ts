// Bảng màu định danh cho biểu đồ hiệu suất.

/**
 * Thứ tự 8 slot KHÔNG phải cho đẹp — nó là cơ chế an toàn cho người mù màu.
 * Được chọn bằng cách duyệt toàn bộ 40320 hoán vị của 8 hue rồi lấy thứ tự tối đa hoá
 * khoảng cách CVD nhỏ nhất giữa hai slot KỀ NHAU, đo trên đúng nền glass của app
 * (#1e293b): min ΔE 27.6 ở protan/deutan/tritan — thứ tự gốc của bảng màu chỉ đạt 7.9.
 * Đổi thứ tự này thì phải chạy lại validator, đừng sửa bằng mắt.
 *
 * Slot 7 (#008300) có contrast 2.96 < 3:1 trên nền này — chấp nhận được vì bảng
 * "Chi tiết theo người" luôn hiện đúng những con số đó dưới dạng text.
 */
export const SERIES_COLORS = [
  '#c98500', // vàng
  '#199e70', // aqua
  '#d95926', // cam
  '#3987e5', // xanh dương
  '#e66767', // đỏ
  '#9085e9', // tím
  '#008300', // xanh lá
  '#d55181', // hồng
];

/** Người thứ 9 trở đi gộp vào đây — KHÔNG bao giờ sinh thêm hue mới. */
export const OTHER_COLOR = '#64748b';
export const OTHER_UID = '__other__';
export const OTHER_NAME = 'Khác';

/**
 * Khoá màu theo CON NGƯỜI, không theo thứ hạng: đổi khoảng sprint mà sơn lại người còn
 * ở lại thì người đọc đã quen "An màu vàng" sẽ bị đánh lừa. Truyền vào danh sách uid xếp
 * theo một tiêu chí ỔN ĐỊNH với bộ lọc (ví dụ tổng task xong của cả dự án, không phải
 * của riêng khoảng đang xem).
 */
export function seriesColorMap(stableUids: string[]): Map<string, string> {
  const map = new Map<string, string>();
  stableUids.slice(0, SERIES_COLORS.length).forEach((uid, i) => map.set(uid, SERIES_COLORS[i]));
  return map;
}

interface Series {
  uid: string;
  name: string;
  data: number[];
}

/** Gộp phần đuôi không có màu vào một series "Khác" duy nhất, cộng dồn theo từng cột. */
export function foldSeries(series: Series[], colorByUid: Map<string, string>) {
  const kept = series.filter((s) => colorByUid.has(s.uid));
  const tail = series.filter((s) => !colorByUid.has(s.uid));
  const out = kept.map((s) => ({ ...s, color: colorByUid.get(s.uid) as string }));
  if (tail.length > 0) {
    const width = series[0]?.data.length ?? 0;
    const merged = Array.from({ length: width }, (_, i) =>
      tail.reduce((sum, s) => sum + (s.data[i] ?? 0), 0),
    );
    out.push({ uid: OTHER_UID, name: `${OTHER_NAME} (${tail.length} người)`, data: merged, color: OTHER_COLOR });
  }
  return out;
}
