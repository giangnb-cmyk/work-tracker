import { useVelocityProgress } from '../../hooks/useVelocityProgress';
import type { LinkedProgress } from '../../lib/velocityLink';
import type { VelocityPlan } from '../../lib/velocity';
import type { Task, VelocityChart } from '../../types';
import BurnupChart from './BurnupChart';
import LinkedTaskList from './LinkedTaskList';
import ProgressLog from './ProgressLog';

interface Props {
  /** Chart với số liệu HIỆU LỰC (đã applyLink nếu link task). */
  chart: VelocityChart;
  plan: VelocityPlan;
  holidaySet: ReadonlySet<string>;
  today: string;
  currentUid: string;
  /** Có = chart link task: dữ liệu dẫn xuất thay nhật ký tay (không mở subscription nhật ký). */
  linked?: { progress: LinkedProgress; label: string };
  onOpenTask?: (task: Task) => void;
}

/**
 * Panel xổ dưới một dòng Gantt: burn-up bên trái; bên phải là nhật ký tay (chart nhập tay)
 * hoặc danh sách task trong phạm vi (chart link). Subscription nhật ký chỉ mở khi cần.
 */
export default function GanttRowDetail({ chart, plan, holidaySet, today, currentUid, linked, onOpenTask }: Props) {
  const { entries: logged, loading } = useVelocityProgress(linked ? null : chart.id);
  const entries = linked ? linked.progress.entries : logged;

  return (
    <div className="gantt-detail glass" onClick={(e) => e.stopPropagation()}>
      <div className="gantt-detail-chart">
        {!linked && loading ? (
          <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
        ) : (
          <BurnupChart chart={chart} plan={plan} entries={entries} holidaySet={holidaySet} today={today} />
        )}
      </div>
      <div className="gantt-detail-log">
        {linked ? (
          <LinkedTaskList scope={linked.progress.scope} label={linked.label} onOpenTask={onOpenTask} />
        ) : (
          <ProgressLog chart={chart} entries={logged} currentUid={currentUid} />
        )}
      </div>
    </div>
  );
}
