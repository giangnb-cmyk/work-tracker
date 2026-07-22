interface Props {
  months: number;
  onChange: (m: number) => void;
  min?: number;
  max?: number;
}

/** Thanh kéo chọn số THÁNG tính chi phí (mặc định 1–36). Kéo tới đâu, mọi tổng đổi theo. */
export default function MonthSlider({ months, onChange, min = 1, max = 36 }: Props) {
  const years = months / 12;
  const yearLabel = Number.isInteger(years) ? `${years}` : years.toFixed(1);

  return (
    <div className="glass section cost-slider">
      <div className="row between cost-slider-head">
        <div>
          <div className="cost-slider-title">Khoảng thời gian tính</div>
          <div className="muted cost-slider-sub">Kéo để đổi số tháng — Tổng lương, chi phí năm và dự chi cập nhật theo.</div>
        </div>
        <div className="cost-slider-readout">
          <span className="cost-slider-months mono">{months}</span>
          <span className="cost-slider-unit"> tháng</span>
          <span className="muted cost-slider-years"> ≈ {yearLabel} năm</span>
        </div>
      </div>
      <input
        type="range"
        className="cost-range"
        min={min}
        max={max}
        step={1}
        value={months}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Số tháng tính chi phí"
      />
      <div className="row between cost-range-ticks muted">
        <span>{min} tháng</span>
        <span>{max} tháng</span>
      </div>
    </div>
  );
}
