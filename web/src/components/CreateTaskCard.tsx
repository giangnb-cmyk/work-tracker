interface Props {
  onClick: () => void;
  label?: string;
  /**
   * 'card' (mặc định) — ô "+" cỡ thẻ, hợp với lưới gallery.
   * 'row' — một dòng gọn, dùng cho các màn dạng danh sách: ô cỡ thẻ đặt trên danh sách
   *   dày đặc sẽ lệch hẳn về mật độ.
   */
  variant?: 'card' | 'row';
}

/** Ô "+" đứng đầu danh sách task — lối tạo task chính. */
export default function CreateTaskCard({ onClick, label = 'Tạo task mới', variant = 'card' }: Props) {
  if (variant === 'row') {
    return (
      <button type="button" className="trow-add" onClick={onClick}>
        <span aria-hidden>＋</span>
        {label}
      </button>
    );
  }
  return (
    <button type="button" className="tcard-new" onClick={onClick}>
      <span className="tcard-new-plus" aria-hidden>＋</span>
      <span className="tcard-new-label">{label}</span>
    </button>
  );
}
