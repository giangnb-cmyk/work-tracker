import { useState } from 'react';

interface Props {
  /** Số tháng lương thưởng mỗi người (0 = tắt). */
  months: number;
  /** Tháng dương trả thưởng (1–12). */
  payMonth: number;
  onChange: (patch: { tetBonusMonths?: number; tetBonusMonth?: number }) => void;
}

/**
 * Cấu hình thưởng Tết của dự án: mặc định 1 THÁNG LƯƠNG/người, chỉnh được số tháng (nhận
 * số lẻ 0.5) và tháng trả. Tiền thưởng tính theo mức lương TẠI THÁNG TRẢ — đã ăn theo các
 * bậc tăng lương dự tính.
 */
export default function TetSettingCard({ months, payMonth, onChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="glass section tet-card">
      <span className="tet-title">🧧 Thưởng Tết</span>
      <label className="tet-field">
        <span className="muted">Số tháng lương / người</span>
        <input
          type="number"
          className="input mono tet-months"
          min={0}
          step={0.5}
          value={draft ?? String(months)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const n = Math.max(0, Number(draft ?? months) || 0);
            setDraft(null);
            if (n !== months) onChange({ tetBonusMonths: n });
          }}
          aria-label="Số tháng lương thưởng Tết"
        />
      </label>
      <label className="tet-field">
        <span className="muted">Trả vào tháng</span>
        <select
          className="select tet-month-sel"
          value={payMonth}
          onChange={(e) => onChange({ tetBonusMonth: Number(e.target.value) })}
          aria-label="Tháng trả thưởng Tết"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>Tháng {m}</option>
          ))}
        </select>
      </label>
      <span className="muted tet-note">
        Tính mỗi năm một lần trong khoảng đang xem, theo lương tại tháng trả (đã gồm tăng lương dự tính). 0 = tắt.
      </span>
    </div>
  );
}
