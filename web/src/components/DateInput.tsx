import { useRef, useState } from 'react';

/**
 * Ô chọn ngày hiển thị dd/mm/yyyy TRÊN MỌI TRÌNH DUYỆT.
 *
 * Vì sao không dùng thẳng <input type="date">: định dạng hiển thị của nó đi theo NGÔN NGỮ
 * TRÌNH DUYỆT của từng người (Chrome tiếng Anh → mm/dd/yyyy), không ép được bằng CSS/props —
 * nên app trông lệch định dạng tuỳ máy. Ở đây: ô text tự quản (gõ tay dd/mm/yyyy, nhận cả
 * d/m/yyyy, d-m-yyyy) + nút 📅 mở date picker GỐC (input date ẩn, showPicker()) để vẫn chọn
 * bằng lịch được. Giá trị ra/vào luôn là ISO 'YYYY-MM-DD' ('' = không có ngày).
 */

/** 'YYYY-MM-DD' → 'dd/mm/yyyy' để hiển thị ('' nếu rỗng). */
function isoToVn(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Gõ tay → ISO. '' = xoá ngày; sai định dạng/ngày không tồn tại (31/02) → null. */
function vnToIso(s: string): string | null {
  const t = s.trim();
  if (t === '') return '';
  const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(t);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

interface Props {
  /** ISO 'YYYY-MM-DD' hoặc ''. */
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  /** false = chỉ ô gõ tay, không nút 📅 (nơi đã có lịch riêng — vd DateRangePicker). */
  withPicker?: boolean;
}

export default function DateInput({ value, onChange, disabled, className, ariaLabel, withPicker = true }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const nativeRef = useRef<HTMLInputElement>(null);

  function commit() {
    if (draft === null) return;
    const iso = vnToIso(draft);
    setDraft(null);
    // Gõ sai thì trả về giá trị cũ (hiển thị tự nhảy lại) — không ghi bừa.
    if (iso !== null && iso !== value) onChange(iso);
  }

  function openPicker() {
    const el = nativeRef.current;
    if (!el) return;
    // showPicker cần user gesture (đang trong onClick — OK); trình duyệt cũ thì fallback click.
    if (typeof el.showPicker === 'function') el.showPicker();
    else el.click();
  }

  return (
    <div className={`date-input${className ? ` ${className}` : ''}`}>
      <input
        className="input date-input-text mono"
        value={draft ?? isoToVn(value)}
        placeholder="dd/mm/yyyy"
        inputMode="numeric"
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setDraft(isoToVn(value))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {withPicker && (
        <>
          <button type="button" className="date-input-btn" onClick={openPicker} disabled={disabled} aria-label="Mở lịch" tabIndex={-1}>
            📅
          </button>
          {/* Input date GỐC ẩn — chỉ để mượn cái lịch của trình duyệt. */}
          <input
            ref={nativeRef}
            type="date"
            className="date-input-native"
            value={value}
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              setDraft(null);
              onChange(e.target.value);
            }}
          />
        </>
      )}
    </div>
  );
}
