import Avatar from '../Avatar';
import { UNASSIGNED_UID, type MemberPerf } from '../../lib/performance';

/** Dưới ngưỡng này thì số ngày không đáng tin — làm mờ thay vì in ra như thể chắc chắn. */
const COVERAGE_FLOOR = 0.5;

interface MemberPerfTableProps {
  rows: MemberPerf[];
  colorByUid: Map<string, string>;
}

function days(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}d`;
}

/**
 * Bảng chi tiết theo người — cũng chính là "table view" đi kèm biểu đồ: mọi giá trị trên
 * chart đều đọc được ở đây dưới dạng text, nên màu không bao giờ là kênh thông tin duy nhất.
 *
 * Giữ ở 7 cột: bản 10 cột bị chật tới mức chữ xuống dòng. Số phụ (trung bình, phủ dữ liệu)
 * nằm cạnh số chính trong cùng ô hoặc trong tooltip.
 */
export default function MemberPerfTable({ rows, colorByUid }: MemberPerfTableProps) {
  return (
    <div className="glass section" style={{ padding: '1.5rem' }}>
      <h3>Chi tiết theo người</h3>
      <p className="perf-hint">
        Trung vị là con số chính; trung bình và độ phủ dữ liệu nằm trong tooltip của ô. Ô mờ
        nghĩa là quá ít dữ liệu để tin.
      </p>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Thành viên</th>
              <th>Xong / Tổng</th>
              <th>%</th>
              <th>Points</th>
              <th>Task trễ</th>
              <th>Đẩy nhiều nhất</th>
              <th>Trung vị</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const thin = r.sampleSize > 0 && r.coverage < COVERAGE_FLOOR;
              const timeTitle =
                r.done === 0
                  ? undefined
                  : `Trung bình ${days(r.meanDays)} · có mốc thời gian ${r.sampleSize}/${r.done} task`;
              return (
                <tr key={r.uid} className={r.total === 0 ? 'row-idle' : undefined}>
                  <td>
                    <span className="perf-who">
                      <span className="perf-dot" style={{ background: colorByUid.get(r.uid) ?? 'transparent' }} />
                      {/* "Chưa giao" không có avatar — chèn ô trống cùng kích thước để tên
                          các dòng vẫn thẳng hàng. */}
                      {r.uid === UNASSIGNED_UID ? (
                        <span className="perf-noavatar" aria-hidden />
                      ) : (
                        <Avatar name={r.name} photoURL={r.photoURL} size="sm" />
                      )}
                      <span className="perf-name">{r.name}</span>
                    </span>
                  </td>
                  <td className="mono">
                    {r.done}
                    <span className="perf-sub">/ {r.total}</span>
                  </td>
                  <td className="mono">{r.total === 0 ? '—' : `${r.percentDone}%`}</td>
                  <td className="mono">{r.donePoints || '—'}</td>
                  <td className="mono">{r.late || '—'}</td>
                  <td className="mono">{r.maxLateSprints > 0 ? `${r.maxLateSprints} sprint` : '—'}</td>
                  <td className={`mono${thin ? ' thin-data' : ''}`} title={timeTitle}>
                    {days(r.medianDays)}
                    {r.done > 0 && <span className="perf-sub">{r.sampleSize}/{r.done}</span>}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="empty">Chưa có dữ liệu trong khoảng này.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
