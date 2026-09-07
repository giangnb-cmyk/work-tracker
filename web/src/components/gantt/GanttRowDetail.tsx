import { useVelocityProgress } from '../../hooks/useVelocityProgress';
import type { VelocityPlan } from '../../lib/velocity';
import type { VelocityChart } from '../../types';
import BurnupChart from './BurnupChart';
import ProgressLog from './ProgressLog';

interface Props {
  chart: VelocityChart;
  plan: VelocityPlan;
  holidaySet: ReadonlySet<string>;
  today: string;
  currentUid: string;
}

/**
 * Panel xổ dưới một dòng Gantt: đồ thị burn-up bên trái, nhật ký tiến độ bên phải.
 * Subscription nhật ký chỉ mở khi panel này mount — đóng dòng là gỡ channel.
 */
export default function GanttRowDetail({ chart, plan, holidaySet, today, currentUid }: Props) {
  const { entries, loading } = useVelocityProgress(chart.id);

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
        <ProgressLog chart={chart} entries={entries} currentUid={currentUid} />
      </div>
    </div>
  );
}
