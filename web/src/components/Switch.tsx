interface Props {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Chữ cạnh công tắc. Sáng lên theo trạng thái bật. */
  label: string;
  disabled?: boolean;
  /** Cho screen reader khi `label` chưa đủ nghĩa nếu đứng một mình. */
  ariaLabel?: string;
}

/**
 * Công tắc kiểu iOS. Chỉ lo phần NHÌN + bật/tắt — nghĩa của "bật" do chỗ gọi định đoạt
 * (task/StatusToggle: đã xong; MyTasks: hiện cả bug đã xong).
 *
 * Tách ra từ StatusToggle để hai nơi dùng đúng một công tắc thay vì chép lại markup —
 * chép thì sớm muộn cũng lệch nhau một nhịp animation hay một sắc xanh.
 */
export default function Switch({ checked, onChange, label, disabled, ariaLabel }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? label}
      className={`status-toggle${checked ? ' on' : ''}${disabled ? ' disabled' : ''}`}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
    >
      <span className="stg-track" aria-hidden>
        <span className="stg-thumb" />
      </span>
      <span className="stg-label">{label}</span>
    </button>
  );
}
