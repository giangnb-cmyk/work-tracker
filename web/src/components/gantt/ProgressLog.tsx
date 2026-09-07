import { useMemo, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog';
import { formatIsoDate, todayIso } from '../../lib/format';
import { fmtQty } from '../../lib/velocity';
import { deleteProgress, logProgress } from '../../lib/velocityProgressWrites';
import type { VelocityChart, VelocityProgress } from '../../types';

interface Props {
  chart: VelocityChart;
  /** Đã sắp theo ngày tăng dần (hook). */
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
 * Nhật ký tiến độ của một chart — ghi "tới hết ngày X đã xong CỘNG DỒN bao nhiêu".
 *
 * Cộng dồn chứ không "làm thêm trong ngày": người ghi chỉ cần nhìn tổng đang có (đếm file,
 * đếm model trong scene) rồi gõ một số, không phải nhớ hôm qua ghi bao nhiêu để trừ.
 * Mọi người trong dự án đều ghi được (RLS 0086) — người làm tự ghi việc của mình.
 */
export default function ProgressLog({ chart, entries, currentUid }: Props) {
  const [day, setDay] = useState(todayIso());
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<VelocityProgress | null>(null);

  const today = todayIso();
  // Mới nhất lên đầu; kèm Δ so với mục liền trước để thấy nhịp từng lần ghi.
  const rows = useMemo(() => {
    const asc = [...entries].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    return asc
      .map((e, i) => ({ ...e, delta: i === 0 ? e.doneQty : e.doneQty - asc[i - 1].doneQty }))
      .reverse();
  }, [entries]);
  const latest = rows[0];

  async function handleLog() {
    const n = parseNum(qty);
    if (!day) return setError('Chọn ngày.');
    if (day > today) return setError('Chưa tới ngày đó. Nhật ký chỉ ghi việc đã xong.');
    if (n === null || n < 0) return setError('Số đã xong phải là số ≥ 0.');
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
        {latest && (
          <span className="gantt-meta">
            Mới nhất {fmtQty(latest.doneQty)} {chart.unit}, ngày {formatIsoDate(latest.day).slice(0, 5)}
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
          placeholder={latest ? `Đang ${fmtQty(latest.doneQty)} ${chart.unit}` : `Đã xong cộng dồn (${chart.unit})`}
          disabled={busy}
          onKeyDown={(e) => e.key === 'Enter' && void handleLog()}
        />
        <button className="btn-primary" onClick={() => void handleLog()} disabled={busy || !qty.trim()}>Ghi</button>
      </div>
      <p className="plog-hint">Ghi số đã xong cộng dồn tới hết ngày đó. Ghi lại cùng ngày để sửa.</p>
      {error && <p className="error-text" style={{ marginTop: '0.4rem' }}>{error}</p>}

      {rows.length === 0 && (
        <div className="plog-empty">Chưa có mục nào. Ghi số của hôm nay để đường tiến độ thật bắt đầu chạy.</div>
      )}

      {rows.length > 0 && (
        <ul className="plog-list">
          {rows.map((r) => (
            <li key={r.day} className="plog-item">
              <span className="mono">{formatIsoDate(r.day).slice(0, 5)}</span>
              <span>
                <b className="mono">{fmtQty(r.doneQty)}</b> <span className="muted">{chart.unit}</span>
              </span>
              <span className={`plog-delta mono${r.delta < 0 ? ' neg' : ''}`}>{r.delta >= 0 ? '+' : ''}{fmtQty(r.delta)}</span>
              <button className="plog-x" onClick={() => setRemoving(r)} title="Xoá mục này" aria-label="Xoá mục này">×</button>
            </li>
          ))}
        </ul>
      )}

      {removing && (
        <ConfirmDialog
          title="Xoá mục tiến độ?"
          message={<>Xoá mục <strong>{formatIsoDate(removing.day)}: {fmtQty(removing.doneQty)} {chart.unit}</strong>.</>}
          detail="Đường tiến độ thật trên đồ thị sẽ mất điểm này; số 'đã làm' của chart lùi về mục mới nhất còn lại."
          confirmLabel="Xoá mục"
          onConfirm={() => handleRemove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
