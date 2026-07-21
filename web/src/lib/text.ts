// Tiện ích chuỗi thuần, không phụ thuộc React — dùng cho tìm kiếm ở các dropdown.

/**
 * Lowercase + bỏ dấu để so khớp thân thiện tiếng Việt: "Nguyễn" khớp "nguyen",
 * "Đỉnh" khớp "dinh". NFD tách dấu thành combining marks (U+0300–U+036F) rồi xoá,
 * riêng đ/Đ không phải là "d + dấu" nên phải thay tay.
 */
export function foldDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
}
