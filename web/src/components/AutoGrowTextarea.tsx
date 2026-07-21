import { useEffect, useRef, type TextareaHTMLAttributes } from 'react';

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string };

/**
 * Textarea tự cao vừa khít nội dung: hết cắt dòng, hết phải kéo tay. Mỗi lần `value` đổi
 * (gõ, hoặc mở modal với mô tả sẵn có) thì đo lại và set chiều cao = scrollHeight.
 * `min-height` để CSS lo (ô rỗng vẫn đủ cao). box-sizing: border-box nên scrollHeight
 * đã gồm padding — set thẳng height là khít.
 */
export default function AutoGrowTextarea({ value, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto'; // thu lại trước để đo đúng cả khi vừa xoá bớt chữ
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return <textarea ref={ref} value={value} {...rest} />;
}
