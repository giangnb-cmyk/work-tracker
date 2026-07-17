// Cắt chữ người dùng nhập thành các khúc chữ/link. THUẦN — không React, test được độc lập.

/** Một khúc của đoạn văn: chữ thường, hoặc một link bấm được (`href`). */
export interface TextSegment {
  text: string;
  href?: string;
}

/** Chỉ bắt http(s) — 'www.foo.com' trần không đoán scheme, dễ đoán sai hơn là bỏ sót. */
const URL_RE = /https?:\/\/[^\s]+/g;

/**
 * Dấu câu dính đuôi KHÔNG thuộc URL: "xem https://a.com/x." thì link là .../x còn dấu
 * chấm là của câu. Gồm cả ngoặc/nháy đóng vì bình luận hay bọc link trong “...”.
 */
const TRAILING = /[.,;:!?)\]}>'"”’]+$/;

/**
 * Tách `text` thành khúc chữ và khúc link, giữ NGUYÊN thứ tự và toàn bộ ký tự — ghép các
 * `text` lại phải ra đúng chuỗi ban đầu.
 */
export function linkify(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  let last = 0;

  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    const trail = m[0].match(TRAILING)?.[0] ?? '';
    const url = trail ? m[0].slice(0, -trail.length) : m[0];
    // Cắt hết chỉ còn scheme (vd "https://...") -> không phải link, để nguyên làm chữ.
    if (url === 'http://' || url === 'https://') continue;

    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ text: url, href: url });
    last = start + url.length;
  }

  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
