import { NOTE_RATINGS } from '../../types';

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
}

/** 5 nút chấm điểm (NOTE_RATINGS). Bấm lại nút đang chọn = bỏ chấm (null). Dùng .seg-toggle sẵn có. */
export default function RatingPicker({ value, onChange }: Props) {
  return (
    <div className="seg-toggle seg-sm" role="group" aria-label="Mức đánh giá">
      {NOTE_RATINGS.map((r) => (
        <button
          key={r.value}
          type="button"
          className={`seg${value === r.value ? ' on' : ''}`}
          title={`${r.value} — ${r.label}`}
          onClick={() => onChange(value === r.value ? null : r.value)}
        >
          <span aria-hidden>{r.icon}</span> {r.value}
        </button>
      ))}
    </div>
  );
}
