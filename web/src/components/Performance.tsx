import { useMemo, useState } from 'react';
import { useSprintContext } from '../contexts/SprintContext';
import { useProjectTasks } from '../hooks/useProjectTasks';
import { useBugs } from '../hooks/useBugs';
import { useTaskReport } from '../hooks/useTaskReport';
import { sortSprintsChronologically, sprintsInRange } from '../lib/sprintRange';
import {
  bugsDoneInRange,
  doneTrend,
  memberPerformance,
  sprintCompletion,
  tasksInRange,
  type PerfCtx,
  type SprintCompletion,
} from '../lib/performance';
import { overtimeBreakdown } from '../lib/overtime';
import { seriesColorMap } from '../lib/perfPalette';
import InsertedTasksSection from './performance/InsertedTasksSection';
import SprintRangePicker from './performance/SprintRangePicker';
import SprintCompletionTable from './performance/SprintCompletionTable';
import SprintDetailDrawer from './performance/SprintDetailDrawer';
import MemberPerfTable from './performance/MemberPerfTable';
import OvertimeTable from './performance/OvertimeTable';
import DoneTrendChart from './performance/DoneTrendChart';
import MetricCaveat from './performance/MetricCaveat';

/** Khoảng mặc định: sprint đang chạy lùi về 3 sprint trước đó. */
const DEFAULT_SPAN = 3;

const CAVEATS = [
  'Trễ = task từng ở một sprint đã kết thúc mà không hoàn thành trong sprint đó. Sprint chưa kết thúc hiện "—" chứ không phải 0.',
  'Số "bị đẩy N sprint" chỉ đếm từ khi bật lịch sử sprint — task được chuyển trước đó không hồi tố được.',
  'Thời gian tính từ lúc task vào sprint đầu tiên đến lần đánh dấu xong đầu tiên; thời gian nằm chờ ở backlog không tính. Task cũ không có lịch sử trạng thái sẽ không có số — xem cột phủ dữ liệu.',
  'Người nhận là người ĐANG được giao. Đổi người nhận thì toàn bộ thành tích của task dồn về người mới; hệ thống không lưu lịch sử giao việc.',
  'Bug không gắn sprint: một bug tính vào sprint nếu NGÀY fix xong rơi trong khoảng của sprint đó. Bug chưa fix không tính vào đâu cả, nên bug chỉ cộng vào phần đã xong chứ không làm tăng khối lượng.',
  'Mốc fix xong chỉ có từ khi bật (migration 0018) — bug done trước đó không hồi tố được. Mốc lấy lúc bot sync thấy tag Done trên forum (mỗi ngày một lần), nên có thể lệch tới 1 ngày ở ranh giới sprint.',
  'Số ngày và cột phủ dữ liệu chỉ tính trên TASK: bug không có lịch sử sprint hay mốc bắt đầu nên không đo được thời gian.',
  'OT = việc đánh dấu xong vào T7/CN (tuần làm việc T2–T6). Mốc là lần đánh dấu xong ĐẦU TIÊN của task / ngày fix xong của bug, đọc theo giờ máy đang xem — mở trang ở múi giờ khác UTC+7 thì ranh giới ngày sẽ lệch.',
  'OT đo lúc ĐÁNH DẤU xong, không phải lúc ngồi làm: fix xong tối thứ 6 mà sáng T7 mới tick thì vẫn vào OT, và ngược lại. Với bug, mốc lấy từ lần bot sync (09:00 mỗi ngày) nên bug xong chiều T6 dễ bị dồn sang T7 — hãy xem đây là chỉ báo để hỏi lại, không phải bằng chứng.',
  'Việc đã xong mà thiếu mốc thời gian không bị tính là "trong tuần": nó nằm riêng ở ô "thiếu mốc xong" và không nằm ở mẫu số của tỷ lệ OT.',
  'Chèn việc = task TẠO MỚI từ thứ 3 trở đi (tuần bắt đầu thứ 2, theo giờ máy đang xem) — mốc là lúc TẠO task, nên task tạo cuối tuần để soạn trước kế hoạch tuần sau vẫn bị đếm là chèn của tuần tạo.',
  '"Tự chèn" = người tạo cũng là người nhận (PM tự tạo việc cho mình cũng tính là tự chèn). "PM chèn" = admin tạo và giao cho người khác. "Khác" = member khác tạo hộ hoặc task bot tạo mà tài khoản Discord chưa liên kết. Phân loại theo role HIỆN TẠI của người tạo.',
  'Người "bị chèn" là người ĐANG được giao — đổi người nhận thì task chèn dồn về người mới. Task chèn chưa giao ai nằm ở dòng "Chưa giao" trong bảng và không vào biểu đồ tròn, nên số giữa biểu đồ có thể nhỏ hơn ô "Task chèn".',
];

/** Trang hiệu suất theo khoảng sprint (chỉ admin — chặn ở Sidebar + Layout). */
export default function Performance() {
  const { sprints, activeSprint, selectedProjectId, members } = useSprintContext();
  const { tasks, loading: tasksLoading } = useProjectTasks(selectedProjectId);
  const { bugs } = useBugs(selectedProjectId);
  const { reports, loading: reportLoading, reload } = useTaskReport(selectedProjectId);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [detail, setDetail] = useState<SprintCompletion | null>(null);

  const ordered = useMemo(() => sortSprintsChronologically(sprints), [sprints]);

  // Mặc định lấy sprint đang chạy (hoặc mới nhất) lùi về DEFAULT_SPAN sprint.
  const effective = useMemo(() => {
    if (range) return range;
    if (ordered.length === 0) return null;
    const toIdx = activeSprint
      ? Math.max(0, ordered.findIndex((s) => s.id === activeSprint.id))
      : ordered.length - 1;
    return { from: ordered[Math.max(0, toIdx - DEFAULT_SPAN)].id, to: ordered[toIdx].id };
  }, [range, ordered, activeSprint]);

  const rangeSprints = useMemo(
    () => (effective ? sprintsInRange(ordered, effective.from, effective.to) : []),
    [ordered, effective],
  );

  // Một mốc thời gian duy nhất cho cả lần render — nếu mỗi dòng tự gọi Date.now() thì
  // các dòng có thể rơi vào hai bên nửa đêm.
  const ctx = useMemo<PerfCtx>(
    () => ({ reports, sprintById: new Map(sprints.map((s) => [s.id, s])), nowMs: Date.now() }),
    [reports, sprints],
  );

  const rangeTasks = useMemo(
    () => tasksInRange(tasks, new Set(rangeSprints.map((s) => s.id)), ctx),
    [tasks, rangeSprints, ctx],
  );

  // Bug không gắn sprint — quy về khoảng đang xem thuần bằng ngày `doneAt`.
  const rangeBugs = useMemo(() => bugsDoneInRange(bugs, rangeSprints), [bugs, rangeSprints]);

  const completion = useMemo(() => sprintCompletion(rangeSprints, tasks, ctx), [rangeSprints, tasks, ctx]);
  const perf = useMemo(
    () => memberPerformance({ tasks: rangeTasks, bugs: rangeBugs, members, ctx }),
    [rangeTasks, rangeBugs, members, ctx],
  );
  const trend = useMemo(() => doneTrend(rangeSprints, perf, rangeTasks), [rangeSprints, perf, rangeTasks]);
  const overtime = useMemo(
    () => overtimeBreakdown({ tasks: rangeTasks, bugs: rangeBugs, members, ctx }),
    [rangeTasks, rangeBugs, members, ctx],
  );

  // Màu khoá theo tổng task xong của CẢ dự án, không theo khoảng đang xem: đổi khoảng
  // sprint mà sơn lại người còn ở lại là đánh lừa người đọc.
  const colorByUid = useMemo(() => {
    const done = new Map<string, number>();
    for (const t of tasks) {
      if (t.status === 'done' && t.assigneeId) done.set(t.assigneeId, (done.get(t.assigneeId) ?? 0) + 1);
    }
    const ranked = [...done.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return seriesColorMap(ranked.map(([uid]) => uid));
  }, [tasks]);

  const sprintNameOf = useMemo(() => {
    const byId = new Map(sprints.map((s) => [s.id, s.name]));
    return (id: string | null) => (id ? byId.get(id) ?? 'sprint khác' : 'Backlog');
  }, [sprints]);

  if (tasksLoading) {
    return <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>;
  }

  return (
    <div className="fade-in">
      <div className="view-header row between">
        <div>
          <h1>Hiệu suất</h1>
          <p>Chỉ admin xem được. Chọn khoảng sprint để so tiến độ theo người.</p>
        </div>
        <button className="btn-sm" onClick={reload} disabled={reportLoading}>
          {reportLoading ? 'Đang tải…' : '↻ Tải lại'}
        </button>
      </div>

      {effective && (
        <SprintRangePicker
          sprints={ordered}
          fromId={effective.from}
          toId={effective.to}
          onChange={(from, to) => setRange({ from, to })}
          resolvedCount={rangeSprints.length}
        />
      )}

      {/* Giữ bản render cũ mờ đi khi đang tải lại, không nháy skeleton gây nhảy layout. */}
      <div className={reportLoading ? 'perf-body reloading' : 'perf-body'}>
        <SprintCompletionTable rows={completion} onOpen={setDetail} />
        <DoneTrendChart trend={trend} colorByUid={colorByUid} />
        <MemberPerfTable rows={perf} colorByUid={colorByUid} />
        <OvertimeTable summary={overtime} />
      </div>

      {/* Chèn việc đi theo TUẦN LỊCH (kế hoạch chốt sáng thứ 2) chứ không theo khoảng
          sprint ở trên — nó có bộ chọn thời gian riêng và không đụng RPC task_report. */}
      <InsertedTasksSection tasks={tasks} members={members} colorByUid={colorByUid} />

      <MetricCaveat items={CAVEATS} />

      {detail && (
        <SprintDetailDrawer
          row={detail}
          tasks={tasks}
          ctx={ctx}
          sprintNameOf={sprintNameOf}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
