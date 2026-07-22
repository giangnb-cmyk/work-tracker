import { useEffect, useRef, useState } from 'react';
import {
  DateRange,
  PRESETS,
  PresetId,
  endOfDay,
  fmtDay,
  monthGrid,
  parseInputDate,
  presetLabel,
  presetRange,
  sameDay,
  startOfDay,
  toInputDate,
} from '../lib/dateRange';
import DateInput from './DateInput';

interface Props {
  value: DateRange;
  onChange: (r: DateRange) => void;
  /** Cột preset bên phải — mặc định là bộ của thống kê truy cập. */
  presets?: { id: PresetId; label: string }[];
  /**
   * Cho chọn ngày TƯƠNG LAI (Timeline: kế hoạch nằm phía trước). Mặc định khoá —
   * thống kê truy cập không có dữ liệu tương lai.
   */
  allowFuture?: boolean;
}

const DOW_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `Thg ${i + 1}`);

/**
 * Bộ chọn khoảng thời gian kiểu GA: hai ô ngày + lịch tháng bấm-2-lần để quét khoảng,
 * cột preset bên phải (60 phút/12 giờ/…/Năm nay). Ngày TƯƠNG LAI bị khoá — thống kê
 * truy cập không có dữ liệu tương lai.
 */
export default function DateRangePicker({ value, onChange, presets = PRESETS, allowFuture = false }: Props) {
  const [open, setOpen] = useState(false);
  // Tháng đang xem trên lịch — neo theo ngày cuối của khoảng đang chọn.
  const [view, setView] = useState(() => {
    const d = new Date(value.toMs);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  // Đã bấm ngày thứ nhất, đang chờ ngày thứ hai (hover để xem trước khoảng).
  const [anchorMs, setAnchorMs] = useState<number | null>(null);
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  const [monthPicker, setMonthPicker] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Đóng khi bấm ra ngoài / Esc — cùng idiom với SearchableSelect.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function openPanel() {
    const d = new Date(value.toMs);
    setView({ y: d.getFullYear(), m: d.getMonth() });
    setAnchorMs(null);
    setMonthPicker(false);
    setOpen((o) => !o);
  }

  function commit(fromDayMs: number, toDayMs: number) {
    const nowMs = Date.now();
    onChange({
      fromMs: startOfDay(fromDayMs),
      // Khoảng chứa hôm nay thì chốt ở "bây giờ" cho khớp preset; quá khứ thì hết ngày.
      // allowFuture (Timeline) thì luôn lấy hết ngày — kế hoạch được phép ở tương lai.
      toMs: allowFuture ? endOfDay(toDayMs) : Math.min(endOfDay(toDayMs), nowMs),
      presetId: null,
    });
    setAnchorMs(null);
    setOpen(false);
  }

  function onDayClick(dayMs: number) {
    if (anchorMs === null) {
      setAnchorMs(dayMs);
      setHoverMs(dayMs);
      return;
    }
    commit(Math.min(anchorMs, dayMs), Math.max(anchorMs, dayMs));
  }

  function onInputChange(which: 'from' | 'to', raw: string) {
    let ms = parseInputDate(raw);
    if (ms === null) return;
    // Trước đây chặn tương lai bằng `max` của <input type="date">; giờ gõ tay qua DateInput
    // nên tự kẹp ở đây (tab Truy cập khoá tương lai, Timeline thì allowFuture).
    if (!allowFuture) ms = Math.min(ms, todayEndMs);
    const from = which === 'from' ? ms : value.fromMs;
    const to = which === 'to' ? ms : value.toMs;
    commit(Math.min(from, to), Math.max(from, to));
  }

  function shiftMonth(delta: number) {
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  const todayEndMs = endOfDay(Date.now());
  // Khoảng đang vẽ trên lịch: đã có neo thì xem trước neo↔hover, chưa thì khoảng thật.
  const previewFrom = anchorMs !== null ? Math.min(anchorMs, hoverMs ?? anchorMs) : value.fromMs;
  const previewTo = anchorMs !== null ? Math.max(anchorMs, hoverMs ?? anchorMs) : value.toMs;

  const triggerLabel = value.presetId
    ? presetLabel(value.presetId)
    : `${fmtDay(value.fromMs)} – ${fmtDay(value.toMs)}`;

  return (
    <div className="drp-wrap" ref={wrapRef}>
      <button type="button" className="drp-trigger" onClick={openPanel} aria-expanded={open}>
        <span>📅 {triggerLabel}</span>
        <span className="ss-caret">▾</span>
      </button>

      {open && (
        <div className="drp-panel glass">
          <div className="drp-main">
            <div className="drp-inputs">
              {/* withPicker=false: panel này đã có lịch riêng ngay dưới — thêm nút 📅 nữa là thừa. */}
              <DateInput
                value={toInputDate(value.fromMs)}
                onChange={(iso) => onInputChange('from', iso)}
                className="drp-date"
                withPicker={false}
                ariaLabel="Từ ngày"
              />
              <span className="muted">–</span>
              <DateInput
                value={toInputDate(value.toMs)}
                onChange={(iso) => onInputChange('to', iso)}
                className="drp-date"
                withPicker={false}
                ariaLabel="Đến ngày"
              />
            </div>

            <div className="drp-head">
              <button
                type="button"
                className="drp-month-label"
                onClick={() => setMonthPicker((v) => !v)}
              >
                Thg {view.m + 1}, {view.y} ▾
              </button>
              <div className="drp-nav">
                <button type="button" onClick={() => shiftMonth(-1)} aria-label="Tháng trước">‹</button>
                <button type="button" onClick={() => shiftMonth(1)} aria-label="Tháng sau">›</button>
              </div>
            </div>

            {monthPicker ? (
              <div className="drp-months">
                <div className="drp-year-row">
                  <button type="button" onClick={() => setView((v) => ({ ...v, y: v.y - 1 }))}>‹</button>
                  <span className="mono">{view.y}</span>
                  <button type="button" onClick={() => setView((v) => ({ ...v, y: v.y + 1 }))}>›</button>
                </div>
                <div className="drp-month-grid">
                  {MONTH_LABELS.map((lb, i) => (
                    <button
                      type="button"
                      key={lb}
                      className={`drp-month-cell${i === view.m ? ' on' : ''}`}
                      onClick={() => {
                        setView((v) => ({ ...v, m: i }));
                        setMonthPicker(false);
                      }}
                    >
                      {lb}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="drp-grid" onMouseLeave={() => setHoverMs(null)}>
                {DOW_LABELS.map((lb) => (
                  <span key={lb} className="drp-dow">{lb}</span>
                ))}
                {monthGrid(view.y, view.m).map((d) => {
                  const ms = d.getTime();
                  const off = d.getMonth() !== view.m;
                  const future = !allowFuture && ms > todayEndMs;
                  const isStart = sameDay(ms, previewFrom);
                  const isEnd = sameDay(ms, previewTo);
                  const inRange = ms >= startOfDay(previewFrom) && ms <= previewTo;
                  const cls = [
                    'drp-day',
                    off && 'off',
                    inRange && !isStart && !isEnd && 'in',
                    isStart && 'edge start',
                    isEnd && 'edge end',
                    sameDay(ms, todayEndMs) && 'today',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <button
                      type="button"
                      key={ms}
                      className={cls}
                      disabled={future}
                      onClick={() => onDayClick(ms)}
                      onMouseEnter={() => anchorMs !== null && setHoverMs(ms)}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="drp-presets" role="listbox" aria-label="Khoảng thời gian nhanh">
            {presets.map((p) => (
              <button
                type="button"
                key={p.id}
                className={`drp-preset${value.presetId === p.id ? ' on' : ''}`}
                onClick={() => {
                  onChange(presetRange(p.id, Date.now()));
                  setOpen(false);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
