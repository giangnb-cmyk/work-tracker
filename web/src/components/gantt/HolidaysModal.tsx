import { useMemo, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog';
import { formatIsoDate, todayIso } from '../../lib/format';
import { deleteHolidays, MAX_HOLIDAY_RANGE_DAYS, upsertHolidayRange, workdaysInRange } from '../../lib/holidayWrites';
import { addDaysIso, isWeekendIso } from '../../lib/workdays';
import type { Holiday } from '../../types';

interface Props {
  holidays: Holiday[];
  /** admin hoặc 'sprint.manage' — người khác chỉ xem. */
  canManage: boolean;
  onClose: () => void;
}

/** Một dải nghỉ liên tục cùng tên (T7/CN kẹp giữa vẫn tính là liên tục). */
interface HolidayRun {
  from: string;
  to: string;
  name: string;
  days: string[];
}

/** Ngày công kế tiếp sau `iso` (nhảy qua T7/CN). */
function nextWorkday(iso: string): string {
  let d = addDaysIso(iso, 1);
  while (isWeekendIso(d)) d = addDaysIso(d, 1);
  return d;
}

/** Gộp các ngày lễ đã sắp thành dải: ngày kế = ngày công kế tiếp của ngày trước và cùng tên. */
function groupRuns(holidays: Holiday[]): HolidayRun[] {
  const sorted = [...holidays].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const runs: HolidayRun[] = [];
  for (const h of sorted) {
    const last = runs[runs.length - 1];
    if (last && last.name === h.name && nextWorkday(last.to) === h.day) {
      last.to = h.day;
      last.days.push(h.day);
    } else {
      runs.push({ from: h.day, to: h.day, name: h.name, days: [h.day] });
    }
  }
  return runs;
}

const dm = (iso: string) => formatIsoDate(iso).slice(0, 5);

/**
 * Danh sách ngày lễ TOÀN CÔNG TY — mọi chart tốc độ ở mọi dự án đều trừ các ngày này khỏi
 * ngày công. Khai theo DẢI (từ → đến); DB lưu từng ngày công, UI gộp lại thành dải để đọc.
 */
export default function HolidaysModal({ holidays, canManage, onClose }: Props) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<HolidayRun | null>(null);

  const today = todayIso();
  const runs = useMemo(() => groupRuns(holidays), [holidays]);
  const upcoming = runs.filter((r) => r.to >= today);
  const past = runs.filter((r) => r.to < today);

  // Chọn "từ" mà chưa có "đến" → đến = từ (nghỉ một ngày là trường hợp thường nhất).
  const effectiveTo = to || from;
  const previewDays = from && effectiveTo && effectiveTo >= from ? workdaysInRange(from, effectiveTo).length : 0;

  async function handleAdd() {
    if (!from) return setError('Chọn ngày bắt đầu.');
    if (effectiveTo < from) return setError('Ngày kết thúc phải sau ngày bắt đầu.');
    if (previewDays === 0) return setError('Dải này chỉ có T7/CN, vốn đã không tính là ngày công.');
    if (previewDays >= MAX_HOLIDAY_RANGE_DAYS) return setError(`Dải quá dài (trên ${MAX_HOLIDAY_RANGE_DAYS} ngày). Kiểm tra lại năm.`);
    setBusy(true);
    setError(null);
    try {
      await upsertHolidayRange(from, effectiveTo, name);
      setFrom('');
      setTo('');
      setName('');
    } catch (err) {
      console.error('Thêm ngày lễ thất bại', err);
      setError('Thêm thất bại. Cần quyền admin hoặc Quản lý sprint.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(run: HolidayRun) {
    try {
      await deleteHolidays(run.days);
      setRemoving(null);
    } catch (err) {
      console.error('Xoá ngày lễ thất bại', err);
      setRemoving(null);
      setError('Xoá thất bại. Cần quyền admin hoặc Quản lý sprint.');
    }
  }

  const renderList = (items: HolidayRun[]) => (
    <ul className="holiday-list">
      {items.map((r) => (
        <li key={r.from} className="holiday-item">
          <span className="mono holiday-day">{r.from === r.to ? dm(r.from) : `${dm(r.from)} → ${dm(r.to)}`}</span>
          <span className="gantt-meta holiday-wd">{r.days.length} ngày công</span>
          <span className="holiday-name">{r.name || <span className="muted">không tên</span>}</span>
          {canManage && (
            <button className="btn-sm btn-danger" onClick={() => setRemoving(r)} title="Bỏ dải nghỉ này">Xoá</button>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>📅 Ngày lễ</h2>
        <p className="perf-hint">
          Dùng chung cả công ty, mọi dự án. Ngày công là thứ 2 đến thứ 6, trừ các ngày này.
          Khai theo dải, T7/CN trong dải tự bỏ.
        </p>

        {canManage && (
          <>
            <div className="holiday-add">
              <label className="holiday-add-f">
                <span>Từ</span>
                <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={busy} />
              </label>
              <label className="holiday-add-f">
                <span>Đến</span>
                <input className="input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} placeholder="= Từ" disabled={busy} />
              </label>
              <label className="holiday-add-f holiday-add-name">
                <span>Tên</span>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Quốc khánh, Tết…"
                  maxLength={80}
                  disabled={busy}
                  onKeyDown={(e) => e.key === 'Enter' && void handleAdd()}
                />
              </label>
              <button className="btn-primary" onClick={() => void handleAdd()} disabled={busy || !from}>Thêm</button>
            </div>
            <p className="plog-hint" style={{ marginBottom: '0.8rem' }}>
              {from
                ? previewDays > 0
                  ? `Sẽ khai ${previewDays} ngày công${effectiveTo !== from ? ` (${dm(from)} → ${dm(effectiveTo)})` : ` (${dm(from)})`}. Bỏ trống "Đến" = nghỉ một ngày.`
                  : 'Dải này không có ngày công nào.'
                : 'Chọn ngày bắt đầu; nghỉ nhiều ngày thì chọn thêm ngày kết thúc.'}
            </p>
          </>
        )}
        {error && <p className="error-text">{error}</p>}

        {runs.length === 0 ? (
          <div className="glass empty">Chưa khai ngày lễ nào.</div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <>
                <div className="holiday-head muted">Sắp tới</div>
                {renderList(upcoming)}
              </>
            )}
            {past.length > 0 && (
              <details className="holiday-past">
                <summary className="muted">Đã qua ({past.length})</summary>
                {renderList(past)}
              </details>
            )}
          </>
        )}

        <div className="modal-actions">
          <button className="btn-sm" onClick={onClose}>Đóng</button>
        </div>
      </div>

      {removing && (
        <ConfirmDialog
          title="Bỏ dải nghỉ này?"
          message={
            <>
              Bỏ <strong>{removing.from === removing.to ? formatIsoDate(removing.from) : `${formatIsoDate(removing.from)} → ${formatIsoDate(removing.to)}`}
              {removing.name ? ` (${removing.name})` : ''}</strong>, {removing.days.length} ngày công, khỏi danh sách ngày lễ.
            </>
          }
          detail="Các ngày này sẽ được tính lại là ngày công ở MỌI chart tốc độ, mọi dự án, nên số 'cần mỗi ngày' của cả đội đổi theo."
          confirmLabel="Bỏ dải nghỉ"
          onConfirm={() => handleRemove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
