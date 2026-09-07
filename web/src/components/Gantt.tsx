import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useHolidays } from '../hooks/useHolidays';
import { useRoles } from '../hooks/useRoles';
import { useVelocityCharts } from '../hooks/useVelocityCharts';
import { todayIso } from '../lib/format';
import { buildAxis } from '../lib/ganttAxis';
import { memberRoleResolver } from '../lib/memberRole';
import { computePlan } from '../lib/velocity';
import GanttRow from './gantt/GanttRow';
import HolidaysModal from './gantt/HolidaysModal';
import VelocityChartModal from './gantt/VelocityChartModal';
import type { VelocityChart } from '../types';

/**
 * Tab Gantt — theo dõi TỐC ĐỘ từng dòng công việc của dự án (vd "Model 3D": 120 model
 * trong tháng 9). Mỗi chart: khối lượng × khoảng ngày × người tham gia → hệ thống tự tính
 * mỗi NGÀY CÔNG cần làm bao nhiêu để kịp deadline, so với tốc độ hiện tại.
 *
 * Ngày công = T2–T6 trừ ngày lễ (bảng holidays, dùng chung cả công ty) — xem lib/workdays.
 * Trục thời gian CHUNG cho mọi dòng để so được cái nào chạy trước/sau (lib/ganttAxis).
 */
export default function Gantt() {
  const { user, isAdmin, can } = useAuth();
  const { selectedProjectId, members } = useSprintContext();
  const { roles } = useRoles();
  const { charts, loading } = useVelocityCharts(selectedProjectId);
  const { holidays, holidaySet } = useHolidays();
  const [editing, setEditing] = useState<VelocityChart | null>(null);
  const [creating, setCreating] = useState(false);
  const [holidaysOpen, setHolidaysOpen] = useState(false);

  const today = todayIso();
  const roleOf = useMemo(() => memberRoleResolver(members, roles), [members, roles]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.uid, m])), [members]);
  const axis = useMemo(() => buildAxis(charts, today), [charts, today]);
  const plans = useMemo(
    () => new Map(charts.map((c) => [c.id, computePlan(c, holidaySet, today)])),
    [charts, holidaySet, today],
  );

  // Sửa/xoá: admin, người tạo, hoặc 'sprint.manage' — khớp RLS velocity_charts_update.
  const canEdit = (c: VelocityChart) => isAdmin || can('sprint.manage') || c.createdBy === user?.uid;
  const canManageHolidays = isAdmin || can('sprint.manage');

  const behind = charts.filter((c) => ['behind', 'overdue'].includes(plans.get(c.id)?.status ?? '')).length;

  if (!selectedProjectId) {
    return <div className="glass empty">Hãy chọn một dự án trước.</div>;
  }

  return (
    <div className="fade-in">
      <div className="view-header row between">
        <div>
          <h1>⏱️ Gantt tốc độ</h1>
          <p>
            {charts.length === 0
              ? 'Mỗi chart là một dòng công việc có khối lượng và deadline — hệ thống tính mỗi ngày công cần làm bao nhiêu.'
              : `${charts.length} chart${behind > 0 ? ` · ${behind} đang chậm/quá hạn` : ' · đều kịp tiến độ'} — ngày công bỏ T7/CN và ${holidays.length} ngày lễ.`}
          </p>
        </div>
        <div className="row" style={{ gap: '0.6rem' }}>
          <button className="btn-sm" onClick={() => setHolidaysOpen(true)} title="Ngày lễ toàn công ty — không tính là ngày công">
            📅 Ngày lễ{holidays.length > 0 ? ` (${holidays.length})` : ''}
          </button>
          <button className="btn-primary" onClick={() => setCreating(true)}>+ Chart mới</button>
        </div>
      </div>

      {loading ? (
        <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
      ) : charts.length === 0 ? (
        <div className="glass empty">
          Chưa có chart nào. Bấm <strong>+ Chart mới</strong> — vd “Model 3D”, 120 model, 01/09 → 30/09,
          chọn 3 người 3D — để xem mỗi ngày cần ra bao nhiêu model.
        </div>
      ) : (
        <div className="gantt">
          {/* Đầu trục: tháng + vạch hôm nay, cùng lưới cột với từng dòng để bar thẳng hàng. */}
          <div className="gantt-head">
            <div className="gantt-info muted" style={{ fontSize: '0.75rem' }}>Công việc · người tham gia</div>
            <div className="gantt-track gantt-axis">
              {axis.months.map((m) => (
                <span key={m.label} className="gantt-month" style={{ left: `${m.leftPct}%`, width: `${m.widthPct}%` }}>
                  {m.label}
                </span>
              ))}
              {axis.todayPct !== null && (
                <span className="gantt-today gantt-today-label" style={{ left: `${axis.todayPct}%` }}>
                  <span>Hôm nay</span>
                </span>
              )}
            </div>
            <div className="gantt-metrics muted" style={{ fontSize: '0.75rem' }}>Đã làm · tốc độ · đánh giá</div>
          </div>

          {charts.map((c) => (
            <GanttRow
              key={c.id}
              chart={c}
              plan={plans.get(c.id)!}
              axis={axis}
              participants={c.memberIds.map((id) => memberById.get(id)).filter((m): m is NonNullable<typeof m> => Boolean(m))}
              roleOf={roleOf}
              onOpen={setEditing}
            />
          ))}

          <p className="muted gantt-legend">
            <span><i className="gantt-lg gantt-lg-done" /> đã làm</span>
            <span><i className="gantt-lg gantt-lg-expect" /> đáng ra tới hôm nay</span>
            <span><i className="gantt-lg gantt-lg-today" /> hôm nay</span>
          </p>
        </div>
      )}

      {(creating || editing) && user && (
        <VelocityChartModal
          chart={editing}
          projectId={selectedProjectId}
          members={members}
          roleOf={roleOf}
          holidaySet={holidaySet}
          currentUid={user.uid}
          canEdit={editing ? canEdit(editing) : true}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}

      {holidaysOpen && (
        <HolidaysModal holidays={holidays} canManage={canManageHolidays} onClose={() => setHolidaysOpen(false)} />
      )}
    </div>
  );
}
