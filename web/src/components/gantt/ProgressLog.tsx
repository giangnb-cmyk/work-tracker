import { useMemo, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog';
import { formatIsoDate, todayIso } from '../../lib/format';
import { fmtQty } from '../../lib/velocity';
import { deleteProgress, logProgress } from '../../lib/velocityProgressWrites';
import type { VelocityChart, VelocityProgress } from '../../types';

interface Props {
  chart: VelocityChart;
  /** Mục nhật ký thô (số làm TRONG ngày), đã sắp theo ngày tăng dần (hook). */
  entries: VelocityProgress[];
  currentUid: string;
}

/** Chuỗi ô số → number; rỗng/sai → null. Cho phép dấu phẩy kiểu VN ("2,5"). */
function parseNum(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Nhật ký tiến độ của một chart — ghi "ngày X làm được N", tổng tự cộng dồn (0089).
 *
 * Ghi theo ngày chứ không ghi tổng: người làm chỉ cần gõ số mình vừa xong, không phải nhớ
 * tổng cũ để cộng tay; sửa một ngày cũ cũng không kéo theo phải sửa mọi ngày sau. Mọi
 * người trong dự án đều ghi được (RLS 0086) — người làm tự ghi việc của mình.
 */
export default function ProgressLog({ chart, entries, currentUid }: Props) {
  const [day, setDay] = useState(todayIso());
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<VelocityProgress | null>(null);

  const today = todayIso();
  // Cộng dồn theo ngày tăng dần để hiện "tổng tới ngày đó" trên từng dòng; hiển thị mới nhất lên đầu.
  const rows = useMemo(() => {
    const asc = [...entries].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    let cum = 0;
    return asc.map((e) => ({ ...e, total: (cum += e.doneQty) })).reverse();
  }, [entries]);
  const total = rows[0]?.total ?? 0;
  const existingForDay = entries.find((e) => e.day === day);

  async function handleLog() {
    const n = parseNum(qty);
    if (!day) return setError('Chọn ngày.');
    if (day > today) return setError('Chưa tới ngày đó. Nhật ký chỉ ghi việc đã xong.');
    if (n === null || n < 0) return setError('Số làm được phải là số ≥ 0.');
    setBusy(true);
    setError(null);
    try {
      await logProgress(chart.id, day, n, currentUid);
      setQty('');
    } catch (err) {
      console.error('Ghi tiến độ thất bại', err);
      setError('Ghi thất bại. Kiểm tra kết nối hoặc quyền xem dự án.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(e: VelocityProgress) {
    try {
      await deleteProgress(e.chartId, e.day);
      setRemoving(null);
    } catch (err) {
      console.error('Xoá mục tiến độ thất bại', err);
      setRemoving(null);
      setError('Xoá thất bại.');
    }
  }

  return (
    <div className="plog">
      <div className="plog-head">
        <strong>Nhật ký tiến độ</strong>
        {rows.length > 0 && (
          <span className="gantt-meta">
            Tổng {fmtQty(total)} {chart.unit} tới {formatIsoDate(rows[0].day).slice(0, 5)}
          </span>
        )}
      </div>

      <div className="plog-add">
        <input className="input" type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} disabled={busy} />
        <input
          className="input"
          inputMode="decimal"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder={existingForDay ? `Ngày này đã ghi ${fmtQty(existingForDay.doneQty)}, gõ để sửa` : `Làm được trong ngày (${chart.unit})`}
          disabled={busy}
          onKeyDown={(e) => e.key === 'Enter' && void handleLog()}
        />
        <button className="btn-primary" onClick={() => void handleLog()} disabled={busy || !qty.trim()}>Ghi</button>
      </div>
      <p className="plog-hint">Ghi số làm được trong ngày đó, tổng tự cộng dồn. Ghi lại cùng ngày để sửa số của ngày đó.</p>
      {error && <p className="error-text" style={{ marginTop: '0.4rem' }}>{error}</p>}

      {rows.length === 0 && (
        <div className="plog-empty">Chưa có mục nào. Ghi số làm được hôm nay để đường tiến độ thật bắt đầu chạy.</div>
      )}

      {rows.length > 0 && (
        <ul className="plog-list">
          {rows.map((r) => (
            <li key={r.day} className="plog-item plog-inc">
              <span className="mono">{formatIsoDate(r.day).slice(0, 5)}</span>
              <span>
                <b className="mono">+{fmtQty(r.doneQty)}</b> <span className="muted">{chart.unit}</span>
              </span>
              <span className="gantt-meta mono" title="Tổng cộng dồn tới hết ngày này">= {fmtQty(r.total)}</span>
              <button className="plog-x" onClick={() => setRemoving(r)} title="Xoá mục này" aria-label="Xoá mục này">×</button>
            </li>
          ))}
        </ul>
      )}

      {removing && (
        <ConfirmDialog
          title="Xoá mục tiến độ?"
          message={<>Xoá mục <strong>{formatIsoDate(removing.day)}: +{fmtQty(removing.doneQty)} {chart.unit}</strong>.</>}
          detail="Tổng đã làm của chart giảm đúng bằng số này; đường tiến độ thật trên đồ thị mất điểm ngày đó."
          confirmLabel="Xoá mục"
          onConfirm={() => handleRemove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
