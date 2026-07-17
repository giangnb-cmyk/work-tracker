// Ctrl+V trong modal -> ảnh thành ảnh Ref, link thành tài liệu.

import { useEffect } from 'react';
import { makeLinkAttachment, uploadImageAttachment } from '../lib/attachments';
import type { Attachment } from '../types';

/** CHỈ nhận URL http(s) đứng một mình — dán đoạn văn có lẫn link thì không tính. */
const URL_RE = /^https?:\/\/\S+$/i;

interface Options {
  /** Đang lưu / chỉ đọc -> không nhận dán. */
  disabled?: boolean;
  /**
   * Ba callback dưới đây nên useCallback-stable (dùng setState dạng hàm) — chúng nằm
   * trong deps của effect, không ổn định thì mỗi lần gõ một chữ là gỡ/gắn lại listener.
   */
  onAdd: (att: Attachment) => void;
  onError: (msg: string) => void;
  onBusy: (busy: boolean) => void;
}

function imageFileFrom(cd: DataTransfer): File | null {
  for (const item of cd.items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  return null;
}

/** Con trỏ đang ở ô nhập liệu? Dán chữ vào Tên/Mô tả thì phải ra chữ, không thành link. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

/** Clipboard luôn đặt tên ảnh trơ là 'image.png' -> tự đặt tên có giờ cho dễ phân biệt. */
function pastedName(file: File): string {
  const ext = (file.type.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '');
  const stamp = new Date().toLocaleString('sv').replace(/[^\d]/g, '-');
  return `anh-dan-${stamp}.${ext}`;
}

/**
 * Ctrl+V ở bất cứ đâu trong modal đang mở:
 * - clipboard có ẢNH  -> upload lên Storage rồi thêm vào Ref. Luôn nuốt event, kể cả khi
 *   con trỏ đang ở ô text: dán ảnh vào ô text vốn không ra gì.
 * - clipboard là LINK -> thêm vào tài liệu. Link ảnh (.png/.jpg…) tự vào Ref vì
 *   makeLinkAttachment nhận diện theo đuôi file. CHỈ nuốt khi con trỏ KHÔNG ở ô nhập.
 *
 * Nghe ở `document` chứ không phải một thẻ bao ngoài: event `paste` bắn vào phần tử đang
 * focus (hoặc <body> khi chưa focus vào đâu), nên gắn vào div bao ngoài sẽ bỏ sót đúng
 * trường hợp hay gặp nhất — vừa mở modal, chưa bấm vào ô nào, Ctrl+V luôn. Listener sống
 * đúng bằng vòng đời modal vì hook chỉ chạy khi modal còn mount.
 */
export function usePasteAttachment({ disabled, onAdd, onError, onBusy }: Options): void {
  useEffect(() => {
    if (disabled) return;

    async function onPaste(e: ClipboardEvent) {
      const cd = e.clipboardData;
      if (!cd) return;

      const file = imageFileFrom(cd);
      if (file) {
        e.preventDefault();
        onBusy(true);
        try {
          onAdd(await uploadImageAttachment(file, pastedName(file)));
        } catch (err) {
          console.error('Dán ảnh từ clipboard thất bại', err);
          onError('Dán ảnh thất bại — kiểm tra Storage rồi thử lại.');
        } finally {
          onBusy(false);
        }
        return;
      }

      if (isTyping(e.target)) return;
      const text = cd.getData('text/plain').trim();
      if (!URL_RE.test(text)) return;
      e.preventDefault();
      onAdd(makeLinkAttachment(text));
    }

    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [disabled, onAdd, onError, onBusy]);
}
