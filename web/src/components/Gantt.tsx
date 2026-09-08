import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useHolidays } from '../hooks/useHolidays';
import { useProjectTasks } from '../hooks/useProjectTasks';
import { useRoles } from '../hooks/useRoles';
import { useVelocityCharts } from '../hooks/useVelocityCharts';
import { TIMELINE_PRESETS, parseInputDate, toInputDate, type DateRange } from '../lib/dateRange';
import { todayIso } from '../lib/format';
import { buildAxis } from '../lib/ganttAxis';
import { memberRoleResolver } from '../lib/memberRole';
import { computePlan } from '../lib/velocity';
import { applyLink, deriveLinked, isLinked, linkLabel } from '../lib/velocityLink';
import DateRangePicker from './DateRangePicker';
import GanttRow from './gantt/GanttRow';
import GanttRowDetail from './gantt/GanttRowDetail';
import HolidaysModal from './gantt/HolidaysModal';
import VelocityChartModal from './gantt/VelocityChartModal';
import TaskModal from './TaskModal';
import type { Task, VelocityChart } from '../types';

/**
 * Tab Gantt — theo dõi TỐC ĐỘ từng dòng công việc của dự án (vd "Model 3D": 120 model
 * trong tháng 9). Mỗi chart: khối lượng × khoảng ngày × người tham gia → hệ thống tự tính
 * mỗi NGÀY CÔNG cần làm bao nhiêu để kịp mốc, so với tốc độ hiện tại. Bấm một dòng để xổ
 * đồ thị burn-up (tiến độ thật · dự kiến · nhịp cần) và nhật ký / danh sách task.
 *
 * Chart LINK task (0087): số liệu dẫn xuất từ task của dự án (useProjectTasks) mỗi lần render
 * — task đổi trạng thái là chart đổi theo, không có nguồn sự thật thứ hai.
 * Ngày công = T2–T6 trừ ngày lễ (bảng holidays, dùng chung cả công ty) — xem lib/workdays.
 *
 * Trục thời gian: mặc định ôm hết mọi chart; chọn khoảng bằng DateRangePicker (cùng bộ preset
 * với tab Timeline) để phóng to — một chart dài cả năm không bóp các chart ngắn thành vạch mỏng.
 */
/** Ô tháng hẹp hơn ngưỡng này (% trục) thì hiện "T9" thay cho "Th 9/2026". */
const NARROW_MONTH_PCT = 9;
/** Vạch hôm nay quá sát mép phải thì nhãn "Hôm nay" lật sang bên trái vạch. */
const TODAY_LABEL_FLIP_PCT = 85;
export default function Gantt() {
  const { user, isAdmin, can } = useAuth();
  const { selectedProjectId, selectedSprintId, members, features } = useSprintContext();
  const { roles } = useRoles();
  const { charts: rawCharts, loading } = useVelocityCharts(selectedProjectId);
  const { tasks } = useProjectTasks(selectedProjectId);
  const { holidays, holidaySet } = useHolidays();
  const [editing, setEditing] = useState<VelocityChart | null>(null);
  const [creating, setCreating] = useState(false);
  const [holidaysOpen, setHolidaysOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  // null = trục ôm hết chart (mặc định); có giá trị = khung người dùng phóng to.
  const [range, setRange] = useState<DateRange | null>(null);

  const today = todayIso();
  const roleOf = useMemo(() => memberRoleResolver(members, roles), [members, roles]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.uid, m])), [members]);
  // Bản GỐC theo id: deriveLinked/form sửa phải nhận doneQty = phần điền tay, không phải bản
  // đã cộng task (applyLink) — không thì phần task bị cộng hai lần.
  const rawById = useMemo(() => new Map(rawCharts.map((r) => [r.id, r])), [rawCharts]);
  const projectFeatures = useMemo(() => features.filter((f) => f.projectId === selectedProjectId), [features, selectedProjectId]);
  // Chart hiệu lực: link thì doneQty/totalQty dẫn xuất từ task; nhập tay giữ nguyên.
  const charts = useMemo(() => rawCharts.map((c) => applyLink(c, tasks, today)), [rawCharts, tasks, today]);
  const axisWindow = useMemo(() => (range ? { from: toInputDate(range.fromMs), to: toInputDate(range.toMs) } : null), [range]);
  const axis = useMemo(() => buildAxis(charts, today, axisWindow), [charts, today, axisWindow]);
  // Giá trị hiện trên nút chọn khoảng khi chưa chọn gì: chính là biên trục đang vẽ.
  const pickerValue: DateRange = range ?? { fromMs: parseInputDate(axis.from) ?? Date.now(), toMs: parseInputDate(axis.to) ?? Date.now(), presetId: null };
  const plans = useMemo(() => new Map(charts.map((c) => [c.id, computePlan(c, holidaySet, today)])), [charts, holidaySet, today]);

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
              ? 'Mỗi chart là một dòng công việc có khối lượng và deadline. Hệ thống tính mỗi ngày công cần làm bao nhiêu.'
              : `${charts.length} chart${behind > 0 ? `, ${behind} đang chậm hoặc quá hạn` : ', đều kịp tiến độ'}. Bấm một dòng để xem burn-up. Ngày công bỏ T7/CN và ${holidays.length} ngày lễ.`}
          </p>
        </div>
        <div className="row" style={{ gap: '0.6rem' }}>
          {range && (
            <button className="btn-sm" onClick={() => setRange(null)} title="Trục ôm hết mọi chart">Tất cả chart</button>
          )}
          <DateRangePicker value={pickerValue} onChange={setRange} presets={TIMELINE_PRESETS} allowFuture />
          <button className="btn-sm" onClick={() => setHolidaysOpen(true)} title="Ngày lễ toàn công ty, không tính là ngày công">
            📅 Ngày lễ{holidays.length > 0 ? ` (${holidays.length})` : ''}
          </button>
          <button className="btn-primary" onClick={() => setCreating(true)}>+ Chart mới</button>
        </div>
      </div>

      {loading ? (
        <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>
      ) : charts.length === 0 ? (
        <div className="glass empty">
          Chưa có chart nào. Bấm <strong>+ Chart mới</strong>, ví dụ “Model 3D”, 120 model, 01/09 → 30/09,
          chọn 3 người 3D, để xem mỗi ngày cần ra bao nhiêu model. Hoặc link thẳng vào một feature để tiến độ tự chạy theo task.
        </div>
      ) : (
        <div className="gantt">
          <div className="gantt-head">
            <div className="gantt-col-label">Công việc</div>
            <div className="gantt-track gantt-axis">
              {axis.months.map((m) => (
                <span key={m.label} className="gantt-month" style={{ left: `${m.leftPct}%`, width: `${m.widthPct}%` }} title={m.label}>
                  {m.widthPct < NARROW_MONTH_PCT ? m.short : m.label}
                </span>
              ))}
              {axis.todayPct !== null && (
                <span
                  className={`gantt-today gantt-today-label${axis.todayPct > TODAY_LABEL_FLIP_PCT ? ' flip' : ''}`}
                  style={{ left: `${axis.todayPct}%` }}
                >
                  <span>Hôm nay</span>
                </span>
              )}
            </div>
            <div className="gantt-col-label">Số liệu</div>
          </div>
          <div className="gantt-legend-row">
            <p className="gantt-legend gantt-legend-main" aria-label="Chú giải">
              <span><i className="gantt-lg gantt-lg-done" /> Đã làm</span>
              <span><i className="gantt-lg gantt-lg-expect" /> Đáng ra tới hôm nay</span>
              <span><i className="gantt-lg gantt-lg-aim" /> Mốc cần xong</span>
              <span><i className="gantt-lg gantt-lg-today" /> Hôm nay</span>
              {axis.windowed && <span><i className="gantt-lg gantt-lg-clip">▸</i> Bar còn tiếp ngoài khung</span>}
            </p>
          </div>

          {charts.map((c) => {
            const plan = plans.get(c.id)!;
            const expanded = expandedId === c.id;
            const label = linkLabel(c, projectFeatures, tasks);
            return (
              <div key={c.id} className="gantt-item">
                <GanttRow
                  chart={c}
                  plan={plan}
                  axis={axis}
                  participants={c.memberIds.map((id) => memberById.get(id)).filter((m): m is NonNullable<typeof m> => Boolean(m))}
                  roleOf={roleOf}
                  linkLabel={label}
                  expanded={expanded}
                  onToggle={(ch) => setExpandedId((cur) => (cur === ch.id ? null : ch.id))}
                  onEdit={setEditing}
                />
                {expanded && user && (
                  <GanttRowDetail
                    chart={c}
                    plan={plan}
                    holidaySet={holidaySet}
                    today={today}
                    currentUid={user.uid}
                    linked={isLinked(c, tasks) && label ? { progress: deriveLinked(rawById.get(c.id) ?? c, tasks, today), label } : undefined}
                    onOpenTask={setOpenTask}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {(creating || editing) && user && (
        <VelocityChartModal
          // Form sửa nhận bản GỐC (số nhập tay), không phải bản đã applyLink — để "khối lượng
          // kế hoạch" hiện đúng giá trị người dùng đã đặt (0 = theo số task).
          chart={editing ? rawById.get(editing.id) ?? editing : null}
          projectId={selectedProjectId}
          members={members}
          roleOf={roleOf}
          holidaySet={holidaySet}
          features={projectFeatures}
          tasks={tasks}
          currentUid={user.uid}
          canEdit={editing ? canEdit(editing) : true}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}

      {holidaysOpen && (
        <HolidaysModal holidays={holidays} canManage={canManageHolidays} onClose={() => setHolidaysOpen(false)} />
      )}

      {openTask && (
        <TaskModal
          task={openTask}
          defaultSprintId={openTask.sprintId ?? selectedSprintId}
          defaultProjectId={selectedProjectId}
          onClose={() => setOpenTask(null)}
        />
      )}
    </div>
  );
}
