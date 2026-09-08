import { useMemo } from 'react';
import { useVelocityProgress } from '../../hooks/useVelocityProgress';
import { cumulate } from '../../lib/burnup';
import type { LinkedProgress } from '../../lib/velocityLink';
import type { VelocityPlan } from '../../lib/velocity';
import type { Task, VelocityChart } from '../../types';
import BurnupChart from './BurnupChart';
import LinkedTaskList from './LinkedTaskList';
import ProgressLog from './ProgressLog';

interface Props {
  /** Chart với số liệu HIỆU LỰC (đã applyLink: đã làm = tay + task). */
  chart: VelocityChart;
  plan: VelocityPlan;
  holidaySet: ReadonlySet<string>;
  today: string;
  currentUid: string;
  /** Có = chart có nguồn task: phạm vi + khối lượng xong theo ngày, cộng thêm vào nhật ký tay. */
  linked?: { progress: LinkedProgress; label: string };
  onOpenTask?: (task: Task) => void;
}

/**
 * Panel xổ dưới một dòng Gantt: burn-up bên trái; bên phải là danh sách task trong phạm vi
 * (nếu có nguồn task) và nhật ký tay — HAI nguồn cùng hiện vì tiến độ là tổng của cả hai.
 */
export default function GanttRowDetail({ chart, plan, holidaySet, today, currentUid, linked, onOpenTask }: Props) {
  const { entries: logged, loading } = useVelocityProgress(chart.id);
  // Đường thật = nhật ký tay ∪ khối lượng task xong theo ngày, rồi cộng dồn.
  const entries = useMemo(
    () => cumulate([...logged, ...(linked?.progress.entries ?? [])]),
    [logged, linked],
  );
  // ProgressLog hiện phần TAY (chart.doneQty đã cộng task) — truyền chart với doneQty phần tay.
  const manualChart = useMemo(
    () => (linked ? { ...chart, doneQty: linked.progress.manualDone } : chart),
    [chart, linked],
  );

  return (
    <div className="gantt-detail glass" onClick={(e) => e.stopPropagation()}>
      <div className="gantt-detail-chart">
        {loading ? (
          <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
        ) : (
          <BurnupChart chart={chart} plan={plan} entries={entries} holidaySet={holidaySet} today={today} />
        )}
      </div>
      <div className="gantt-detail-log">
        {linked && (
          <LinkedTaskList chart={chart} scope={linked.progress.scope} label={linked.label} onOpenTask={onOpenTask} />
        )}
        <ProgressLog chart={manualChart} entries={logged} currentUid={currentUid} compact={Boolean(linked)} />
      </div>
    </div>
  );
}
