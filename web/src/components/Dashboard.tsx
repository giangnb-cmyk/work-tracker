import { useMemo } from 'react';
import {
  ArcElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';
import { useSprintContext } from '../contexts/SprintContext';
import { useTasks } from '../hooks/useTasks';
import { burndownSeries, computeStats, groupByAssignee } from '../lib/sprint';
import DepartmentDonuts from './DepartmentDonuts';
import { daysUntil } from '../lib/format';
import { STATUS_LABEL, TASK_STATUSES } from '../types';

ChartJS.register(ArcElement, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const STATUS_COLORS = ['#94a3b8', '#38bdf8', '#c084fc', '#22c55e'];

/** Sprint analytics: stat tiles, status doughnut, burndown, per-assignee load. */
export default function Dashboard() {
  const { selectedSprint, selectedSprintId, members } = useSprintContext();
  const { tasks, loading } = useTasks(selectedSprintId);

  const stats = useMemo(() => computeStats(tasks), [tasks]);
  const burndown = useMemo(
    () => (selectedSprint ? burndownSeries(selectedSprint, tasks) : null),
    [selectedSprint, tasks],
  );
  const perAssignee = useMemo(() => [...groupByAssignee(tasks).entries()], [tasks]);
  const daysLeft = selectedSprint ? daysUntil(selectedSprint.endDate) : null;

  if (loading) {
    return (
      <div className="center-screen" style={{ minHeight: 200 }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="view-header">
        <h1>Thống kê{selectedSprint ? ` · ${selectedSprint.name}` : ' · Backlog'}</h1>
        <p>Tiến độ và phân bổ công việc.</p>
      </div>

      <div className="stats-row">
        <StatTile icon="📦" value={stats.total} label="Tổng task" />
        <StatTile icon="✅" value={`${stats.percentDone}%`} label="Hoàn thành" />
        <StatTile icon="⭐" value={`${stats.donePoints}/${stats.totalPoints}`} label="Story points" />
        <StatTile
          icon={stats.overdue > 0 ? '⚠️' : '⏱️'}
          value={daysLeft === null ? stats.overdue : daysLeft < 0 ? 'Hết hạn' : `${daysLeft}`}
          label={daysLeft === null ? 'Task quá hạn' : 'Ngày còn lại'}
        />
      </div>

      <div className="board" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'stretch' }}>
        <div className="glass section" style={{ padding: '1.5rem' }}>
          <h3>Phân bố trạng thái</h3>
          {stats.total === 0 ? (
            <div className="empty">Chưa có task.</div>
          ) : (
            // Fixed-height wrapper + maintainAspectRatio:false so the canvas can't grow unbounded.
            <div style={{ height: 260, position: 'relative' }}>
              <Doughnut
                data={{
                  labels: TASK_STATUSES.map((s) => STATUS_LABEL[s]),
                  datasets: [
                    {
                      data: TASK_STATUSES.map((s) => stats.byStatus[s]),
                      backgroundColor: STATUS_COLORS,
                      borderColor: '#1e293b',
                      borderWidth: 2,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: '62%',
                  plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } },
                }}
              />
            </div>
          )}
        </div>

        <div className="glass section" style={{ padding: '1.5rem' }}>
          <h3>Burndown</h3>
          {!burndown || burndown.labels.length === 0 ? (
            <div className="empty">Cần sprint có ngày bắt đầu/kết thúc.</div>
          ) : (
            <div style={{ height: 260, position: 'relative' }}>
            <Line
              data={{
                labels: burndown.labels,
                datasets: [
                  {
                    label: 'Lý tưởng',
                    data: burndown.ideal,
                    borderColor: '#475569',
                    borderDash: [6, 6],
                    pointRadius: 0,
                    tension: 0,
                  },
                  {
                    label: 'Thực tế',
                    data: burndown.actual as number[],
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99,102,241,0.15)',
                    fill: true,
                    tension: 0.25,
                    spanGaps: false,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#94a3b8' } } },
                scales: {
                  x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                  y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true },
                },
              }}
            />
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <h3 style={{ marginBottom: '1rem' }}>% Hoàn thành theo bộ phận</h3>
        <DepartmentDonuts tasks={tasks} members={members} />
      </div>

      <div className="glass section" style={{ padding: '1.5rem' }}>
        <h3>Khối lượng theo người</h3>
        {perAssignee.length === 0 ? (
          <div className="empty">Chưa có task.</div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Thành viên</th>
                  <th>Tổng</th>
                  <th>Đang làm</th>
                  <th>Xong</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                {perAssignee.map(([name, list]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td className="mono">{list.length}</td>
                    <td className="mono">{list.filter((t) => t.status !== 'done').length}</td>
                    <td className="mono">{list.filter((t) => t.status === 'done').length}</td>
                    <td className="mono">{list.reduce((sum, t) => sum + (t.points ?? 0), 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatTile({ icon, value, label }: { icon: string; value: string | number; label: string }) {
  return (
    <div className="stat-card glass">
      <span className="stat-icon">{icon}</span>
      <div className="stat-info">
        <span className="stat-value">{value}</span>
        <span className="stat-label">{label}</span>
      </div>
    </div>
  );
}
