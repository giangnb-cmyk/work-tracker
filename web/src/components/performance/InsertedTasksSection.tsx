import { useCallback, useMemo, useRef, useState } from 'react';
import { ArcElement, Chart as ChartJS, Legend, Tooltip, type Plugin } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { useClickOutside } from '../../hooks/useClickOutside';
import { appFontFamily, applyChartTheme, CHART_MUTED, CHART_SURFACE, legendGap } from '../../lib/chartTheme';
import { fmtDay, presetLabel, presetRange, type DateRange } from '../../lib/dateRange';
import { INSERT_KIND_LABEL, insertedTaskStats, type InsertedMemberRow, type InsertKind } from '../../lib/insertedTasks';
import { UNASSIGNED_UID } from '../../lib/performance';
import { OTHER_COLOR } from '../../lib/perfPalette';
import type { Task, TeamMember } from '../../types';
import Avatar from '../Avatar';
import DateRangePicker from '../DateRangePicker';
import InsertedTasksDrawer from './InsertedTasksDrawer';

ChartJS.register(ArcElement, Tooltip, Legend);
applyChartTheme();

/** Màu lát khi soi MỘT người (cơ cấu ai chèn) — khớp màu badge .ins-* trong drawer. */
const KIND_COLORS: Record<InsertKind, string> = {
  self: '#38bdf8',
  admin: '#6366f1',
  other: OTHER_COLOR,
};
const KIND_ORDER: InsertKind[] = ['self', 'admin', 'other'];

/**
 * Số tổng giữa donut — đọc THẲNG từ chart.data thay vì đóng closure lên state React:
 * react-chartjs-2 chỉ nhận inline plugin lúc TẠO chart, còn data được update mỗi lần
 * render, nên đọc từ data thì đổi khoảng thời gian không để lại con số cũ.
 */
const centerTotal: Plugin<'doughnut'> = {
  id: 'inserted-center',
  afterDraw(chart) {
    let total = 0;
    for (const v of chart.data.datasets[0]?.data ?? []) {
      if (typeof v === 'number') total += v;
    }
    const { ctx } = chart;
    const { left, right, top, bottom } = chart.chartArea;
    const family = appFontFamily();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f8fafc';
    ctx.font = `700 26px ${family}`;
    ctx.fillText(String(total), (left + right) / 2, (top + bottom) / 2 - 6);
    ctx.fillStyle = CHART_MUTED;
    ctx.font = `500 12px ${family}`;
    ctx.fillText('task chèn', (left + right) / 2, (top + bottom) / 2 + 16);
    ctx.restore();
  },
};

interface InsertedTasksSectionProps {
  tasks: Task[];
  members: TeamMember[];
  /** Màu khoá theo CON NGƯỜI của cả trang Hiệu suất — cùng người, cùng màu ở mọi chart. */
  colorByUid: Map<string, string>;
}

/**
 * Chèn việc trong tuần: kế hoạch chốt sáng thứ 2, task tạo mới từ THỨ 3 trở đi là việc
 * bị chèn. Donut chia theo người ĐANG được giao; bảng bên cạnh là "table view" của chart
 * (mọi con số đọc được bằng text, màu không bao giờ là kênh thông tin duy nhất).
 */
export default function InsertedTasksSection({ tasks, members, colorByUid }: InsertedTasksSectionProps) {
  // Khoảng mặc định "Tuần này" — đúng câu hỏi thường trực "tuần này ai bị chèn gì".
  const [range, setRange] = useState<DateRange>(() => presetRange('week', Date.now()));
  const [detail, setDetail] = useState<InsertedMemberRow | null>(null);
  // Người đang được "soi": các dòng khác mờ đi, donut chuyển sang cơ cấu ai-chèn của
  // riêng người này. null = biểu đồ tổng.
  const [focusedUid, setFocusedUid] = useState<string | null>(null);

  const summary = useMemo(
    () => insertedTaskStats({ tasks, members, fromMs: range.fromMs, toMs: range.toMs }),
    [tasks, members, range.fromMs, range.toMs],
  );

  // Đổi khoảng/realtime có thể làm người đang soi rớt về 0 task — coi như hết focus,
  // đừng vẽ donut rỗng.
  const focusedRow = useMemo(
    () => summary.rows.find((r) => r.uid === focusedUid && r.total > 0) ?? null,
    [summary.rows, focusedUid],
  );

  // Bấm ra ngoài vùng chart + bảng → về biểu đồ tổng. Tắt khi drawer đang mở, nếu không
  // mọi cú bấm trong drawer (vốn nằm ngoài vùng này) đều xoá mất focus.
  const gridRef = useRef<HTMLDivElement>(null);
  const clearFocus = useCallback(() => setFocusedUid(null), []);
  useClickOutside(gridRef, clearFocus, focusedUid !== null && detail === null);

  const rangeLabel = range.presetId
    ? presetLabel(range.presetId).toLowerCase()
    : `${fmtDay(range.fromMs)} – ${fmtDay(range.toMs)}`;

  // Hai chế độ lát donut:
  // - Tổng: mỗi lát một người ĐƯỢC GIAO (dòng "Chưa giao" ở bảng, không vào chart);
  //   người ngoài bảng 8 màu gộp thành một lát "Khác" xám — không sinh thêm hue mới.
  // - Soi một người: lát theo AI CHÈN (tự/PM/khác), màu khớp badge trong drawer.
  const { slices, sliceRows } = useMemo(() => {
    if (focusedRow) {
      const counts: Record<InsertKind, number> = {
        self: focusedRow.self,
        admin: focusedRow.byAdmin,
        other: focusedRow.other,
      };
      const kinds = KIND_ORDER.filter((k) => counts[k] > 0);
      return {
        slices: kinds.map((k) => ({ name: INSERT_KIND_LABEL[k], value: counts[k], color: KIND_COLORS[k] })),
        // Lát "ai chèn" không trỏ tới người nào — bấm vào không đổi focus.
        sliceRows: kinds.map(() => null) as (InsertedMemberRow | null)[],
      };
    }
    const memberRows = summary.rows.filter((r) => r.uid !== UNASSIGNED_UID && r.total > 0);
    const kept = memberRows.filter((r) => colorByUid.has(r.uid));
    const tail = memberRows.filter((r) => !colorByUid.has(r.uid));
    const slices = kept.map((r) => ({
      name: r.name,
      value: r.total,
      color: colorByUid.get(r.uid) as string,
    }));
    const sliceRows: (InsertedMemberRow | null)[] = [...kept];
    if (tail.length > 0) {
      slices.push({
        name: `Khác (${tail.length} người)`,
        value: tail.reduce((sum, r) => sum + r.total, 0),
        color: OTHER_COLOR,
      });
      sliceRows.push(null); // lát gộp không soi riêng ai được
    }
    return { slices, sliceRows };
  }, [focusedRow, summary.rows, colorByUid]);

  return (
    <>
    <div className="glass section ins-section" style={{ padding: '1.5rem' }}>
      <div className="row between" style={{ alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <h3>🧨 Chèn việc trong tuần</h3>
          <p className="perf-hint">
            Kế hoạch tuần chốt sáng thứ 2 — task <strong>tạo mới từ thứ 3 trở đi</strong> tính
            là chèn, chia theo người đang được giao. Bấm một dòng để soi riêng người đó,
            nút Chi tiết để xem từng task.
          </p>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      <div className="ot-tiles">
        <div className="ot-tile">
          <span className="ot-tile-num mono">{summary.total}</span>
          <span className="ot-tile-lb muted">Task chèn · {rangeLabel}</span>
        </div>
        <div className="ot-tile">
          <span className="ot-tile-num mono">{summary.self}</span>
          <span className="ot-tile-lb muted">Member tự chèn</span>
        </div>
        <div className="ot-tile">
          <span className="ot-tile-num mono">{summary.byAdmin}</span>
          <span className="ot-tile-lb muted">PM chèn cho nhân viên</span>
        </div>
        <div className="ot-tile">
          <span className="ot-tile-num mono">{summary.other}</span>
          <span className="ot-tile-lb muted">Khác (member khác tạo hộ / bot chưa link)</span>
        </div>
      </div>

      {summary.total === 0 ? (
        <div className="empty">Không có task nào bị chèn trong khoảng này 🎉</div>
      ) : (
        <div className="ins-grid" ref={gridRef}>
          <div>
            {/* Nhãn chế độ đứng NGOÀI hộp cao cố định của canvas để không đè lên chart. */}
            <p className="perf-hint" style={{ marginBottom: '0.35rem', textAlign: 'center' }}>
              {focusedRow ? (
                <>Đang soi <strong>{focusedRow.name}</strong> — bấm ra ngoài để về tổng</>
              ) : (
                'Cả team — bấm một lát / một dòng để soi riêng'
              )}
            </p>
            <div style={{ height: 260, position: 'relative' }}>
              {slices.length === 0 ? (
                <div className="empty">Toàn bộ task chèn đều chưa giao ai — xem bảng bên.</div>
              ) : (
                <Doughnut
                  data={{
                    labels: slices.map((s) => s.name),
                    datasets: [
                      {
                        data: slices.map((s) => s.value),
                        backgroundColor: slices.map((s) => s.color),
                        // Viền màu NỀN = khe hở 2px giữa các lát, không phải "kẻ viền".
                        borderColor: CHART_SURFACE,
                        borderWidth: 2,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '68%',
                    onClick: (_evt, elements) => {
                      const el = elements[0];
                      // Bấm nền canvas (không trúng lát nào) → về tổng.
                      if (!el) return setFocusedUid(null);
                      const row = sliceRows[el.index];
                      if (row) setFocusedUid((cur) => (cur === row.uid ? null : row.uid));
                    },
                    plugins: {
                      legend: { position: 'bottom', labels: { color: CHART_MUTED, boxWidth: 12, boxHeight: 12 } },
                    },
                  }}
                  plugins={[centerTotal, legendGap(16)]}
                />
              )}
            </div>
          </div>
          <InsertedByMemberTable
            rows={summary.rows}
            colorByUid={colorByUid}
            focusedUid={focusedRow?.uid ?? null}
            onFocus={(uid) => setFocusedUid((cur) => (cur === uid ? null : uid))}
            onOpen={setDetail}
          />
        </div>
      )}
    </div>

    {/* Ở NGOÀI thẻ glass: backdrop-filter biến thẻ thành containing block cho position:
        fixed, render bên trong thì overlay bị nhốt trong card thay vì phủ màn hình. */}
    {detail && (
      <InsertedTasksDrawer row={detail} rangeLabel={rangeLabel} onClose={() => setDetail(null)} />
    )}
    </>
  );
}

function InsertedByMemberTable({
  rows,
  colorByUid,
  focusedUid,
  onFocus,
  onOpen,
}: {
  rows: InsertedMemberRow[];
  colorByUid: Map<string, string>;
  focusedUid: string | null;
  onFocus: (uid: string) => void;
  onOpen: (row: InsertedMemberRow) => void;
}) {
  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            <th>Thành viên</th>
            <th>Bị chèn</th>
            <th>Tự chèn</th>
            <th>PM chèn</th>
            <th>Khác</th>
            <th aria-label="Xem chi tiết" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            // Đang soi một người thì các dòng còn lại lùi về nền — kể cả dòng 0 task.
            const cls = [
              r.total === 0 ? 'row-idle' : 'row-click',
              focusedUid !== null && r.uid !== focusedUid && 'ins-row-dim',
              focusedUid === r.uid && 'ins-row-focus',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <tr key={r.uid} className={cls} onClick={r.total > 0 ? () => onFocus(r.uid) : undefined}>
                <td>
                  <span className="perf-who">
                    <span className="perf-dot" style={{ background: colorByUid.get(r.uid) ?? 'transparent' }} />
                    {/* "Chưa giao" không có avatar — chèn ô trống cùng cỡ để tên vẫn thẳng hàng. */}
                    {r.uid === UNASSIGNED_UID ? (
                      <span className="perf-noavatar" aria-hidden />
                    ) : (
                      <Avatar name={r.name} photoURL={r.photoURL} size="sm" />
                    )}
                    <span className="perf-name">{r.name}</span>
                  </span>
                </td>
                <td className="mono">{r.total || '—'}</td>
                <td className="mono">{r.self || '—'}</td>
                <td className="mono">{r.byAdmin || '—'}</td>
                <td className="mono">{r.other || '—'}</td>
                <td>
                  {r.total > 0 && (
                    <button
                      className="ins-detail-btn"
                      // stopPropagation: nút mở drawer, đừng để row click phía dưới đổi focus.
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(r);
                      }}
                    >
                      Chi tiết
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="empty">Chưa có thành viên nào.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
