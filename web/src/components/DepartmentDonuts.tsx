import { Doughnut } from 'react-chartjs-2';
import type { Plugin } from 'chart.js';
import { groupByJobRole, type DeptGroup } from '../lib/sprint';
import { JOB_ROLE_ICON, JOB_ROLE_LABEL, type Task, type TeamMember } from '../types';

const DONE_COLOR = '#22c55e';
const REMAINING_COLOR = '#334155';

/** Human label + icon for a department bucket (handles the 'unknown' fallback). */
function deptLabel(key: DeptGroup['key']): { icon: string; label: string } {
  if (key === 'unknown') return { icon: '❓', label: 'Chưa phân loại' };
  return { icon: JOB_ROLE_ICON[key], label: JOB_ROLE_LABEL[key] };
}

/**
 * One donut per department showing % of tasks done, drawn in the ring's center.
 * The percent text is painted by a per-chart plugin (Chart.js has no built-in center label).
 */
export default function DepartmentDonuts({
  tasks,
  members,
}: {
  tasks: Task[];
  members: TeamMember[];
}) {
  const groups = groupByJobRole(tasks, members);
  if (groups.length === 0) return <div className="empty">Chưa có task.</div>;

  return (
    <div
      className="board"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem' }}
    >
      {groups.map((g) => (
        <DeptDonut key={g.key} group={g} />
      ))}
    </div>
  );
}

function DeptDonut({ group }: { group: DeptGroup }) {
  const { icon, label } = deptLabel(group.key);
  const remaining = group.total - group.done;

  // Center-text plugin: draws "NN%" + "done/total" in the middle of this donut only.
  const centerText: Plugin<'doughnut'> = {
    id: `center-${group.key}`,
    afterDraw(chart) {
      const { ctx } = chart;
      const { left, right, top, bottom } = chart.chartArea;
      const cx = (left + right) / 2;
      const cy = (top + bottom) / 2;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 26px Outfit, sans-serif';
      ctx.fillText(`${group.percentDone}%`, cx, cy - 6);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '500 12px Inter, sans-serif';
      ctx.fillText(`${group.done}/${group.total}`, cx, cy + 16);
      ctx.restore();
    },
  };

  return (
    <div className="glass section" style={{ padding: '1rem', textAlign: 'center' }}>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>
        <span style={{ marginRight: 4 }}>{icon}</span>
        {label}
      </div>
      <div style={{ height: 150, position: 'relative' }}>
        <Doughnut
          data={{
            labels: ['Hoàn thành', 'Còn lại'],
            datasets: [
              {
                data: [group.done, remaining],
                backgroundColor: [DONE_COLOR, REMAINING_COLOR],
                borderColor: '#1e293b',
                borderWidth: 2,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: { legend: { display: false }, tooltip: { enabled: true } },
          }}
          plugins={[centerText]}
        />
      </div>
    </div>
  );
}
