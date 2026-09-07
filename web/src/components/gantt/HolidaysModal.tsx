import { useState } from 'react';
import ConfirmDialog from '../ConfirmDialog';
import { formatIsoDate, todayIso } from '../../lib/format';
import { deleteHoliday, upsertHoliday } from '../../lib/holidayWrites';
import { isWeekendIso } from '../../lib/workdays';
import type { Holiday } from '../../types';

interface Props {
  holidays: Holiday[];
  /** admin hoặc 'sprint.manage' — người khác chỉ xem. */
  canManage: boolean;
  onClose: () => void;
}

const WEEKDAY_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function weekdayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAY_VI[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/**
 * Danh sách ngày lễ TOÀN CÔNG TY — mọi chart tốc độ ở mọi dự án đều trừ các ngày này khỏi
 * ngày công. T7/CN đã tự bỏ, không cần khai ở đây.
 */
export default function HolidaysModal({ holidays, canManage, onClose }: Props) {
  const [day, setDay] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Holiday | null>(null);

  const today = todayIso();
  const upcoming = holidays.filter((h) => h.day >= today);
  const past = holidays.filter((h) => h.day < today);

  async function handleAdd() {
    if (!day) {
      setError('Chọn ngày trước đã.');
      return;
    }
    if (isWeekendIso(day)) {
      setError('Ngày đó là T7/CN — vốn đã không tính là ngày công, không cần khai.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await upsertHoliday(day, name);
      setDay('');
      setName('');
    } catch (err) {
      console.error('Thêm ngày lễ thất bại', err);
      setError('Thêm thất bại — cần quyền admin hoặc Quản lý sprint.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(h: Holiday) {
    try {
      await deleteHoliday(h.day);
      setRemoving(null);
    } catch (err) {
      console.error('Xoá ngày lễ thất bại', err);
      setRemoving(null);
      setError('Xoá thất bại — cần quyền admin hoặc Quản lý sprint.');
    }
  }

  const renderList = (items: Holiday[]) => (
    <ul className="holiday-list">
      {items.map((h) => (
        <li key={h.day} className="holiday-item">
          <span className="mono holiday-day">{formatIsoDate(h.day)}</span>
          <span className="muted holiday-wd">{weekdayOf(h.day)}</span>
          <span className="holiday-name">{h.name || <span className="muted">—</span>}</span>
          {canManage && (
            <button className="btn-sm btn-danger" onClick={() => setRemoving(h)} title="Bỏ ngày lễ này">Xoá</button>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>📅 Ngày lễ</h2>
        <p className="perf-hint">
          Dùng chung cả công ty, mọi dự án. Ngày công = T2–T6 trừ các ngày này. T7/CN tự bỏ,
          không cần khai.
        </p>

        {canManage && (
          <div className="holiday-add">
            <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} disabled={busy} />
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tên (Quốc khánh, Tết…)"
              maxLength={80}
              disabled={busy}
              onKeyDown={(e) => e.key === 'Enter' && void handleAdd()}
            />
            <button className="btn-primary" onClick={() => void handleAdd()} disabled={busy || !day}>Thêm</button>
          </div>
        )}
        {error && <p className="error-text">{error}</p>}

        {holidays.length === 0 ? (
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
          title="Bỏ ngày lễ?"
          message={<>Bỏ <strong>{formatIsoDate(removing.day)}{removing.name ? ` — ${removing.name}` : ''}</strong> khỏi danh sách ngày lễ.</>}
          detail="Ngày này sẽ được tính lại là ngày công ở MỌI chart tốc độ, mọi dự án — số 'cần mỗi ngày' của cả đội đổi theo."
          confirmLabel="Bỏ ngày lễ"
          onConfirm={() => handleRemove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
