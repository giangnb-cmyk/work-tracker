import { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useProjectTasks } from '../hooks/useProjectTasks';
import { useFeatureLabels } from '../hooks/useFeatureLabels';
import DateRangePicker from './DateRangePicker';
import DateInput from './DateInput';
import TaskModal from './TaskModal';
import ConfirmDialog from './ConfirmDialog';
import { createFeatureLabel, deleteFeatureLabel, updateFeatureLabel } from '../lib/featureLabelWrites';
import { labelGroup } from '../lib/bugLabelGroups';
import { toInputDate } from '../lib/format';
import { Timestamp } from '../lib/time';
import { TIMELINE_PRESETS, startOfDay, startOfWeek, type DateRange } from '../lib/dateRange';
import { buildVersionRows, type FeatureRow, type TaskBar, type VersionRow } from '../lib/timelineRows';
import { requestReleaseSync } from '../lib/releaseSyncWrites';
import TimelineFeatureRow, { type TimelineScale } from './timeline/TimelineFeatureRow';
import FeatureTasksModal from './timeline/FeatureTasksModal';
import type { Feature, FeatureLabel, Task } from '../types';

const DAY = 86_400_000;

function label(ms: number): string {
  return new Date(ms).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

/**
 * Timeline CẢ DỰ ÁN theo ba tầng: version → feature → task. Bar của tầng nào cũng phủ
 * từ task sớm nhất tới hạn muộn nhất của nó, fill = % task xong. Mặc định đóng hết —
 * mở ra mới thấy tầng dưới; đóng lại thì đây chính là lộ trình phát hành.
 *
 * Khoảng thời gian chọn bằng DateRangePicker (cùng bộ với tab Truy cập, nhưng cho phép
 * tương lai).
 */
export default function Timeline() {
  const { user, isAdmin, can } = useAuth();
  const { selectedProjectId, selectedProject, features } = useSprintContext();
  const { tasks, loading } = useProjectTasks(selectedProjectId);
  const { labels } = useFeatureLabels(selectedProjectId);
  // null = "cả dự án": khung tự co giãn theo min→max hạn của toàn bộ task.
  const [range, setRange] = useState<DateRange | null>(null);
  const [openVersions, setOpenVersions] = useState<Set<string>>(new Set());
  /** Feature đang mở popup danh sách task; null = không mở. */
  const [taskListRow, setTaskListRow] = useState<FeatureRow | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  /** Nhãn version đang sửa mốc phát hành tại chỗ (id); null = không sửa cái nào. */
  const [editingRelease, setEditingRelease] = useState<string | null>(null);
  /**
   * Form tạo version — Timeline là NƠI DUY NHẤT tạo version (FeatureModal giờ chỉ pick):
   * version là mốc lộ trình, tạo ở đúng màn nhìn lộ trình thì mới thấy ngay nó nằm đâu.
   */
  const [versionFormOpen, setVersionFormOpen] = useState(false);
  const [vName, setVName] = useState('');
  const [vDate, setVDate] = useState('');
  const [vBusy, setVBusy] = useState(false);
  const [vError, setVError] = useState<string | null>(null);
  /** Version chờ xác nhận xoá (thao tác không hoàn tác — bắt buộc ConfirmDialog). */
  const [confirmDelVersion, setConfirmDelVersion] = useState<FeatureLabel | null>(null);

  /**
   * Chốt mốc phát hành cho một version. Không đóng ô sửa ngay: người ta hay gõ lại vài lần
   * cho đúng, đóng phắt sau cú đầu là bắt bấm mở lại. Bấm "Xong" mới đóng.
   *
   * Ngày về từ DateInput là ISO 'YYYY-MM-DD'; updateFeatureLabel tự cắt lại đúng dạng đó
   * cho cột `date`. '' = xoá mốc.
   */
  async function saveRelease(labelId: string, iso: string) {
    try {
      await updateFeatureLabel(labelId, { releaseDate: iso ? Timestamp.fromDate(new Date(iso)) : null });
      setSyncMsg(iso ? `Đã đặt mốc phát hành ${label(new Date(iso).getTime())}.` : 'Đã xoá mốc phát hành.');
    } catch (err) {
      console.error('Lưu mốc phát hành thất bại', err);
      setSyncMsg('Lưu mốc phát hành thất bại — cần quyền admin.');
    } finally {
      setTimeout(() => setSyncMsg(null), 6000);
    }
  }

  /**
   * Xếp yêu cầu cho bot đọc lại lịch từ sheet. Web không đọc được Google Sheets (service
   * account chỉ có ở bot) nên không thể làm tại chỗ — bot rút hàng đợi rồi ghi lại, ngày
   * mới tự hiện qua realtime.
   */
  async function syncRelease() {
    if (!selectedProjectId) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      await requestReleaseSync(selectedProjectId, user?.uid ?? '');
      setSyncMsg('Đã gửi yêu cầu — bot đọc sheet trong giây lát, lịch tự cập nhật.');
    } catch (err) {
      console.error('Yêu cầu sync lịch phát hành thất bại', err);
      setSyncMsg('Gửi yêu cầu thất bại (cần quyền admin, và migration 0033 đã áp).');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 8000);
    }
  }

  /** Tạo version = tạo nhãn version (+ mốc phát hành nếu có). Realtime tự đưa vào list. */
  async function createVersion() {
    const nm = vName.trim();
    if (!nm || !selectedProjectId) return;
    // Chặn sớm tên không đúng dạng version: tạo xong mà groupFeaturesByVersion không nhận
    // ra thì nó thành nhãn nhóm thường, "biến mất" khỏi Timeline — khó hiểu hơn nhiều.
    if (labelGroup(nm) !== 'version') {
      setVError('Tên version phải là dạng số — vd 1.2.x, 2.0, v1.3 — để hệ thống nhận ra đây là version.');
      return;
    }
    if (labels.some((l) => l.name.toLowerCase() === nm.toLowerCase())) {
      setVError('Version này đã có rồi.');
      return;
    }
    setVError(null);
    setVBusy(true);
    try {
      // Version luôn xám (#94a3b8) — cùng quy ước với FeatureModal trước đây.
      await createFeatureLabel(
        { projectId: selectedProjectId, name: nm, color: '#94a3b8', icon: '', releaseDate: vDate || null },
        user?.uid ?? '',
      );
      setVName('');
      setVDate('');
      setSyncMsg(`Đã tạo version ${nm} — gắn feature vào version ở màn sửa feature (ô "Version delivery").`);
      setTimeout(() => setSyncMsg(null), 8000);
    } catch (err) {
      console.error('Tạo version thất bại', err);
      setVError('Tạo version thất bại — cần quyền "Quản lý nhãn".');
    } finally {
      setVBusy(false);
    }
  }

  async function removeVersion(l: FeatureLabel) {
    setConfirmDelVersion(null);
    try {
      await deleteFeatureLabel(l.id);
      setSyncMsg(`Đã xoá version ${l.name}.`);
    } catch (err) {
      console.error('Xoá version thất bại', err);
      setSyncMsg('Xoá version thất bại — cần quyền "Quản lý nhãn".');
    } finally {
      setTimeout(() => setSyncMsg(null), 6000);
    }
  }

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const taskBars: TaskBar[] = useMemo(
    () =>
      tasks.map((t) => {
        const s = t.dueStart?.toMillis() ?? t.dueDate?.toMillis() ?? 0;
        const e = t.dueDate?.toMillis() ?? t.dueStart?.toMillis() ?? 0;
        return { task: t, start: startOfDay(s || e), end: startOfDay(e || s), hasDates: Boolean(s || e) };
      }),
    [tasks],
  );

  /** Mốc tạo dự án — điểm bắt đầu của bản đầu tiên (nó không có bản nào trước để bám). */
  const projectStartMs = useMemo(() => {
    const ms = selectedProject?.createdAt?.toMillis();
    return ms ? startOfDay(ms) : null;
  }, [selectedProject]);

  /**
   * Khung "cả dự án": min→max các task có hạn, luôn chứa hôm nay, mọi ngày phát hành VÀ
   * mốc tạo dự án.
   *
   * Phải tính cả ngày phát hành: lịch release chốt trước, thường nằm xa hơn hạn task
   * cuối cùng — bỏ ra ngoài thì bar version bị kẹp lại ở mép, nhìn như đã tới nơi. Mốc
   * tạo dự án cũng vậy, ở đầu kia: nó là điểm bắt đầu của bản đầu tiên.
   */
  const projectDomain = useMemo(() => {
    const now = startOfDay(Date.now());
    const marks = [
      ...taskBars.filter((b) => b.hasDates).flatMap((b) => [b.start, b.end]),
      ...labels.map((l) => l.releaseDate?.toMillis()).filter((ms): ms is number => Boolean(ms)),
      // Mốc mong muốn của feature (0071) — cùng lý do với ngày phát hành: nó thường nằm xa
      // hơn hạn task cuối, bỏ ra ngoài khung là cờ 🎯 bị cắt mất đúng lúc cần nhìn nhất.
      ...features
        .filter((f) => f.projectId === selectedProjectId)
        .map((f) => f.targetDate?.toMillis())
        .filter((ms): ms is number => Boolean(ms)),
      ...(projectStartMs !== null ? [projectStartMs] : []),
    ];
    if (marks.length === 0) return { start: now - DAY, end: now + 30 * DAY };
    return {
      start: Math.min(...marks, now) - DAY,
      end: Math.max(...marks, now) + DAY,
    };
  }, [taskBars, labels, projectStartMs, features, selectedProjectId]);

  // Trục hiển thị theo TUẦN: neo hai mép khung vào Thứ 2 để mọi cột tuần tròn cạnh —
  // khoảng chọn tay/preset chỉ quyết định tuần nào lọt vào khung.
  const domain = useMemo(() => {
    const raw = range ? { start: startOfDay(range.fromMs), end: startOfDay(range.toMs) } : projectDomain;
    return { start: startOfWeek(raw.start), end: startOfWeek(raw.end) + 6 * DAY };
  }, [range, projectDomain]);

  // Gộp theo feature. Task có hạn phải GIAO với khoảng đang xem; task chưa hạn luôn
  // được giữ (không vẽ được bar nhưng vẫn tính vào tổng của feature).
  const rows: FeatureRow[] = useMemo(() => {
    const byFeature = new Map<string, TaskBar[]>();
    for (const b of taskBars) {
      if (b.hasDates && (b.start > domain.end || b.end < domain.start)) continue;
      const key = b.task.featureId ?? 'other';
      let arr = byFeature.get(key);
      if (!arr) {
        arr = [];
        byFeature.set(key, arr);
      }
      arr.push(b);
    }
    const make = (feature: Feature | null, bars: TaskBar[]): FeatureRow => {
      const sorted = [...bars].sort(
        (a, b) => Number(b.hasDates) - Number(a.hasDates) || a.start - b.start,
      );
      const dated = sorted.filter((b) => b.hasDates);
      return {
        feature,
        bars: sorted,
        start: dated.length ? Math.min(...dated.map((b) => b.start)) : 0,
        end: dated.length ? Math.max(...dated.map((b) => b.end)) : 0,
        hasDates: dated.length > 0,
        done: sorted.filter((b) => b.task.status === 'done').length,
        total: sorted.length,
      };
    };
    const out: FeatureRow[] = [];
    for (const f of features) {
      if (f.projectId !== selectedProjectId) continue;
      // Feature CHƯA có task nào vẫn có hàng (bars rỗng -> "chưa có hạn"): xổ một version
      // ghi "14 feature" ra mà trống trơn thì còn khó hiểu hơn là không cho xổ.
      out.push(make(f, byFeature.get(f.id) ?? []));
    }
    const other = byFeature.get('other');
    if (other?.length) out.push(make(null, other));
    // "Khác" xuống cuối; còn lại: có hạn trước, rồi theo ngày bắt đầu.
    return out.sort(
      (a, b) =>
        Number(a.feature === null) - Number(b.feature === null) ||
        Number(b.hasDates) - Number(a.hasDates) ||
        a.start - b.start,
    );
  }, [taskBars, features, selectedProjectId, domain]);

  const versionRows: VersionRow[] = useMemo(
    () => buildVersionRows(rows, labels, projectStartMs),
    [rows, labels, projectStartMs],
  );

  /**
   * TOÀN BỘ version của dự án cho panel quản lý — khác versionRows: biểu đồ lọc bỏ
   * version chưa chốt ngày + chưa có việc (chống nhiễu), nên version vừa tạo "biến mất"
   * nếu không có chỗ này để nhìn.
   */
  const versionLabels = useMemo(
    () =>
      labels
        .filter((l) => labelGroup(l.name) === 'version')
        .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true })),
    [labels],
  );

  /** Số feature đang gắn từng nhãn (chỉ tính feature của dự án đang chọn). */
  const featureCountByLabel = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of features) {
      if (f.projectId !== selectedProjectId) continue;
      for (const id of f.labelIds) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [features, selectedProjectId]);

  const span = Math.max(DAY, domain.end + DAY - domain.start);

  /** Các Thứ 2 trong khung — mỗi mốc là một CỘT tuần của trục. */
  const weeks = useMemo(() => {
    const out: number[] = [];
    for (let t = domain.start; t <= domain.end; t += 7 * DAY) out.push(t);
    return out;
  }, [domain]);
  // Khung dài (cả năm ~52 tuần) thì nhãn chen nhau — thưa nhãn ra, còn LƯỚI vẫn theo tuần.
  const labelEvery = Math.max(1, Math.ceil(weeks.length / 16));

  const pct = (ms: number) => ((ms - domain.start) / span) * 100;
  const clampPct = (v: number) => Math.max(0, Math.min(100, v));
  const todayPct = pct(startOfDay(Date.now()));
  // Kẻ dọc ranh giới tuần cho MỌI hàng (gradient lặp theo đúng bề rộng một tuần) — nhìn
  // vào là thấy bar đè lên tuần nào, không phải dò ngược lên trục.
  const weekPct = ((7 * DAY) / span) * 100;
  const grid = {
    backgroundImage: `repeating-linear-gradient(to right, rgba(148, 163, 184, 0.13) 0 1px, transparent 1px ${weekPct}%)`,
  } as const;
  const scale: TimelineScale = { pct, clampPct, todayPct, label, grid };

  if (!selectedProjectId) {
    return <div className="glass empty">Hãy chọn một dự án trước.</div>;
  }
  if (loading) {
    return <div className="center-screen" style={{ minHeight: 200 }}><div className="spinner" /></div>;
  }

  const pickerValue: DateRange = range ?? { fromMs: domain.start, toMs: domain.end, presetId: null };

  return (
    <div className="fade-in">
      <div className="view-header row between">
        <div>
          <h1>Timeline · {selectedProject?.name ?? 'Dự án'}</h1>
          <p>Theo version — xổ một bản ra để xem feature, xổ feature để xem task.</p>
        </div>
        <div className="row" style={{ gap: '0.5rem' }}>
          {can('label.manage') && (
            <button
              className="btn-sm"
              onClick={() => { setVersionFormOpen((o) => !o); setVError(null); }}
              title="Danh sách version của dự án — xem / tạo / xoá"
              aria-expanded={versionFormOpen}
            >
              🏷️ Versions{versionLabels.length > 0 ? ` (${versionLabels.length})` : ''}
            </button>
          )}
          {isAdmin && (
            <button
              className="btn-sm"
              onClick={syncRelease}
              disabled={syncing}
              title="Đọc lại lịch phát hành từ sheet release (tab Timeline)"
            >
              {syncing ? 'Đang gửi…' : '🔄 Sync lịch'}
            </button>
          )}
          {range && (
            <button className="btn-sm" onClick={() => setRange(null)}>Cả dự án</button>
          )}
          <DateRangePicker value={pickerValue} onChange={setRange} presets={TIMELINE_PRESETS} allowFuture />
        </div>
      </div>

      {versionFormOpen && can('label.manage') && (
        <div className="glass tl-vform">
          <div className="tl-vform-new">
            <label className="field">
              <span>Tên version</span>
              <input
                className="input"
                placeholder="vd: 1.2.x"
                value={vName}
                maxLength={40}
                onChange={(e) => setVName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void createVersion(); } }}
              />
            </label>
            <label className="field">
              <span>Ngày phát hành (tuỳ chọn)</span>
              <DateInput value={vDate} onChange={setVDate} ariaLabel="Ngày phát hành version mới" />
            </label>
            <button className="btn-sm" onClick={() => void createVersion()} disabled={vBusy || !vName.trim()}>
              {vBusy ? 'Đang tạo…' : '＋ Tạo version'}
            </button>
          </div>
          {vError && <p className="error-text tl-vform-hint">{vError}</p>}

          {/* Danh sách ĐẦY ĐỦ — kể cả version chưa chốt ngày + chưa gắn feature, thứ
              biểu đồ cố tình giấu (chống nhiễu) nên phải xem được ở đây. */}
          <div className="tl-vlist">
            {versionLabels.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>Chưa có version nào — tạo cái đầu tiên ở trên.</p>
            ) : (
              versionLabels.map((l) => {
                const count = featureCountByLabel.get(l.id) ?? 0;
                const releaseMs = l.releaseDate?.toMillis() ?? null;
                return (
                  <div key={l.id} className="tl-vlist-row">
                    <span className="tl-vlist-name">🏷️ {l.name}</span>
                    <span className="muted mono">
                      {releaseMs !== null ? `🚩 ${label(releaseMs)}` : 'chưa chốt ngày'}
                    </span>
                    <span className="muted">{count} feature</span>
                    {count === 0 && releaseMs === null && (
                      <span className="muted tl-vlist-note">chưa lên biểu đồ</span>
                    )}
                    <button
                      type="button"
                      className="btn-sm btn-danger tl-vlist-del"
                      title={`Xoá version ${l.name}`}
                      onClick={() => setConfirmDelVersion(l)}
                    >
                      🗑
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <p className="muted tl-vform-hint">
            Version tạo ở đây; feature pick version trong màn sửa feature (ô "Version delivery").
            Chưa chốt ngày thì bar suy từ hạn task, chốt rồi thì bar chạy theo lịch — sửa mốc
            bằng nút 🚩 trên hàng version của biểu đồ.
          </p>
        </div>
      )}

      {syncMsg && <div className="callout-inline" style={{ marginBottom: '1rem' }}>{syncMsg}</div>}

      {versionRows.length === 0 ? (
        <div className="glass empty">
          Chưa có version nào chốt ngày phát hành, và cũng chưa có task nào trong khoảng này.
        </div>
      ) : (
        <div className="glass tl-wrap">
          <div className="tl-scroll">
            {/* Axis — mỗi cột một TUẦN: số thứ tự tuần (trong khung) + ngày Thứ 2 của tuần.
                Nhãn đặt ở GIỮA cột (t + 3.5 ngày) cho đúng nghĩa "cột tuần" — mốc đầu tuần
                đã có đường kẻ lưới lo. */}
            <div className="tl-axis">
              <div className="tl-row-label tl-axis-label muted">Version · Feature · Task</div>
              <div className="tl-track tl-axis-track weeks" style={grid}>
                {weeks.map((t, i) =>
                  i % labelEvery !== 0 ? null : (
                    <span key={t} className="tl-tick tl-week-tick" style={{ left: `${pct(t + 3.5 * DAY)}%` }}>
                      <b>{i + 1}</b>
                      <em>{label(t)}</em>
                    </span>
                  ),
                )}
                {todayPct >= 0 && todayPct <= 100 && (
                  <span className="tl-today" style={{ left: `${todayPct}%` }} title="Hôm nay" />
                )}
              </div>
            </div>

            {/* Version → feature → task */}
            {versionRows.map((v) => {
              const vOpen = openVersions.has(v.key);
              const vDonePct = v.total === 0 ? 0 : Math.round((v.done / v.total) * 100);
              const vLeft = clampPct(pct(v.start));
              const vRight = clampPct(pct(v.end + DAY));
              return (
                <div key={v.key}>
                  <div
                    className="tl-row tl-ver"
                    onClick={() => setOpenVersions((s) => toggle(s, v.key))}
                  >
                    <div className="tl-row-label">
                      <span className={`tl-caret${vOpen ? ' open' : ''}`} aria-hidden>▸</span>
                      <span className="tl-name">
                        {v.label ? `🏷️ ${v.label.name}` : '📦 Chưa gắn version'}
                      </span>
                      <span className="muted tl-who mono">
                        {/* Ngày phát hành — con số người ta mở Timeline lên để tìm. Admin
                            bấm vào là sửa TẠI CHỖ: sheet release không phải nguồn duy nhất,
                            và bắt mở Google Sheet chỉ để dời một mốc là quá xa. Bấm phải
                            chặn nổi bọt, không thì hàng version xổ/đóng ngay dưới tay. */}
                        {v.label && editingRelease === v.label.id ? (
                          <span className="tl-release-edit" onClick={(e) => e.stopPropagation()}>
                            <DateInput
                              value={toInputDate(v.label.releaseDate)}
                              onChange={(iso) => void saveRelease(v.label!.id, iso)}
                              ariaLabel={`Ngày phát hành ${v.label.name}`}
                            />
                            <button className="btn-sm" onClick={() => setEditingRelease(null)}>Xong</button>
                          </span>
                        ) : (
                          <>
                            {/* Khoảng thời gian CHỈ hiện khi chưa chốt ngày (suy từ hạn
                                task); đã chốt thì 🚩 + bar nói đủ — cột nhãn có 240px,
                                nhét cả hai là tên version bị ép mất. */}
                            {v.hasDates && v.releaseMs === null && `${label(v.start)}–${label(v.end)} · `}
                            {isAdmin && v.label ? (
                              <button
                                type="button"
                                className={`tl-release-btn${v.releaseMs === null ? ' empty' : ''}`}
                                title="Sửa mốc phát hành của bản này"
                                onClick={(e) => { e.stopPropagation(); setEditingRelease(v.label!.id); }}
                              >
                                🚩 {v.releaseMs !== null ? label(v.releaseMs) : 'đặt mốc'}
                              </button>
                            ) : (
                              v.releaseMs !== null && `🚩 ${label(v.releaseMs)} · `
                            )}
                            {v.rows.length} feature · {v.done}/{v.total}
                            {can('label.manage') && v.label && (
                              <button
                                type="button"
                                className="tl-ver-del"
                                title={`Xoá version ${v.label.name}`}
                                onClick={(e) => { e.stopPropagation(); setConfirmDelVersion(v.label); }}
                              >
                                🗑
                              </button>
                            )}
                          </>
                        )}
                      </span>
                    </div>
                    <div className="tl-track" style={grid}>
                      {todayPct >= 0 && todayPct <= 100 && (
                        <span className="tl-today faint" style={{ left: `${todayPct}%` }} />
                      )}
                      {v.hasDates ? (
                        <span
                          className="tl-bar tl-feat-bar tl-ver-bar"
                          title={`${label(v.start)} → ${label(v.end)} · ${vDonePct}% xong`}
                          style={{
                            left: `${vLeft}%`,
                            width: `${Math.max(1.5, vRight - vLeft)}%`,
                            background: 'rgba(99, 102, 241, 0.2)',
                          }}
                        >
                          <span
                            className="tl-feat-fill"
                            style={{ width: `${vDonePct}%`, background: 'var(--primary)' }}
                          />
                        </span>
                      ) : (
                        <span className="tl-nodate muted">chưa có hạn</span>
                      )}
                    </div>
                  </div>

                  {vOpen && v.rows.map((row) => (
                    <TimelineFeatureRow
                      key={`${v.key}:${row.feature?.id ?? 'other'}`}
                      row={row}
                      onOpen={() => setTaskListRow(row)}
                      scale={scale}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {taskListRow && (
        <FeatureTasksModal
          row={taskListRow}
          onClose={() => setTaskListRow(null)}
          // Đóng popup trước rồi mới mở chi tiết: hai lớp popup chồng nhau đọc không ra.
          onJump={(t) => { setTaskListRow(null); setEditing(t); }}
        />
      )}

      {editing && (
        <TaskModal task={editing} defaultSprintId={editing.sprintId} onClose={() => setEditing(null)} />
      )}

      {confirmDelVersion && (
        <ConfirmDialog
          title="Xoá version?"
          message={<>Version <strong>"{confirmDelVersion.name}"</strong> sẽ bị xoá.</>}
          detail="Feature đang gắn version này sẽ về nhóm “Chưa gắn version”, và nhãn cũng biến mất khỏi bộ lọc + ô chọn version của feature. Không khôi phục được."
          confirmLabel="Xoá version"
          onConfirm={() => void removeVersion(confirmDelVersion)}
          onCancel={() => setConfirmDelVersion(null)}
        />
      )}
    </div>
  );
}
