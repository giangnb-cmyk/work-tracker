import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useProjectCosts } from '../hooks/useProjectCosts';
import { useProjectMembers } from '../hooks/useProjectMembers';
import { useMemberComp } from '../hooks/useMemberComp';
import { useCostPlanning } from '../hooks/useCostPlanning';
import { useOptimisticList } from '../hooks/useOptimisticList';
import { useStoredView } from '../hooks/useStoredView';
import {
  addCostItem,
  addCostProjection,
  deleteCostItem,
  deleteCostProjection,
  seedDefaultCostItems,
  setMemberItems,
  updateCostItem,
  updateCostProjection,
  upsertCostSettings,
  upsertRevenue,
  type CostItemPatch,
  type CostProjectionPatch,
} from '../lib/costWrites';
import { anchorMonth, buildCostSeries, monthIso, overheadTotal } from '../lib/projectCost';
import { COST_PROJECTION_KIND_LABEL, type CostEmployeeRow, type CostProjection, type CostProjectionKind } from '../types';
import CostChart from './cost/CostChart';
import CostSummary from './cost/CostSummary';
import EmployeeCostTable from './cost/EmployeeCostTable';
import ItemPickerModal from './cost/ItemPickerModal';
import MonthSlider from './cost/MonthSlider';
import OverheadTable from './cost/OverheadTable';
import ProjectionTable from './cost/ProjectionTable';
import RevenueEditor from './cost/RevenueEditor';
import TetSettingCard from './cost/TetSettingCard';

/** Hai màn con của tab Chi phí: bảng số liệu và biểu đồ theo tháng. */
type CostView = 'table' | 'chart';
const COST_VIEWS: readonly CostView[] = ['table', 'chart'];

/** Popup gán khoản chi phí đang mở cho ai: một nhân sự, hoặc một dòng dự chi. */
type PickerTarget = { kind: 'member'; employee: CostEmployeeRow } | { kind: 'projection'; projection: CostProjection };

const MONTHS_KEY = 'cost-horizon-months';
const DEFAULT_MONTHS = 12;

function readMonths(): number {
  try {
    const v = Number(localStorage.getItem(MONTHS_KEY));
    return v >= 1 && v <= 36 ? v : DEFAULT_MONTHS;
  } catch {
    return DEFAULT_MONTHS;
  }
}

/**
 * Nội dung tính chi phí của MỘT dự án (`projectId` do khu quản trị truyền vào — xem CostAdmin):
 * slider tháng, thẻ tổng, bảng lương (chỉ đọc — sửa ở tab Thành viên), chi phí thiết bị/vận
 * hành và dự chi. Lương là dữ liệu nhạy cảm nên toàn bộ khoá admin-only ở RLS.
 */
export default function CostManagement({ projectId }: { projectId: string }) {
  const { profile } = useAuth();
  const { members } = useSprintContext();
  const {
    items: serverItems,
    projections: serverProjections,
    memberItemIds,
    refetchItems,
    refetchProjections,
    refetchMemberItems,
    loading: costsLoading,
  } = useProjectCosts(projectId);
  const { memberships, loading: mLoading } = useProjectMembers(projectId);
  const { byMember: compByMember, loading: compLoading } = useMemberComp();
  const { settings, revenueByMonth, plansByMember, refetchSettings, refetchRevenue, loading: planLoading } =
    useCostPlanning(projectId);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [cview, selectCview] = useStoredView<CostView>('costTabView', COST_VIEWS, 'table');

  // Ghi lạc quan cho thưởng Tết + doanh thu (giá trị đơn lẻ, không có id để dùng
  // useOptimisticList): overlay cục bộ đè lên server, reset khi đổi dự án; server về
  // cùng giá trị nên overlay "đứng lại" cũng vô hại.
  const [tetLocal, setTetLocal] = useState<{ tetBonusMonths?: number; tetBonusMonth?: number }>({});
  const [revLocal, setRevLocal] = useState<Map<number, number>>(new Map());
  useEffect(() => {
    setTetLocal({});
    setRevLocal(new Map());
  }, [projectId]);

  const tetMonths = tetLocal.tetBonusMonths ?? settings.tetBonusMonths;
  const tetMonth = tetLocal.tetBonusMonth ?? settings.tetBonusMonth;
  const revenueEffective = useMemo(() => {
    if (revLocal.size === 0) return revenueByMonth;
    const merged = new Map(revenueByMonth);
    for (const [k, v] of revLocal) merged.set(k, v);
    return merged;
  }, [revenueByMonth, revLocal]);

  // Ghi lạc quan: tick/gõ là UI đổi NGAY, ghi chạy nền — không đợi vòng realtime (~1s).
  const { rows: items, mutate: mutateItems, create: createItems } = useOptimisticList(serverItems, refetchItems);
  const {
    rows: projections,
    mutate: mutateProjections,
    create: createProjections,
  } = useOptimisticList(serverProjections, refetchProjections);

  const [months, setMonths] = useState(readMonths);
  const [error, setError] = useState<string | null>(null);

  const createdBy = profile?.uid ?? null;

  const changeMonths = useCallback((m: number) => {
    setMonths(m);
    try {
      localStorage.setItem(MONTHS_KEY, String(m));
    } catch {
      // sở thích không lưu được thì thôi
    }
  }, []);

  // Bọc mọi mutation: RLS chặn non-admin (42501) → hiện thông báo, không để văng lặng.
  const runOp = useCallback(async (op: () => Promise<void>, failMsg: string) => {
    try {
      await op();
      setError(null);
    } catch (err) {
      console.error(failMsg, err);
      setError(failMsg);
    }
  }, []);

  const memberById = useMemo(() => new Map(members.map((m) => [m.uid, m])), [members]);

  // Nhân sự của bảng chi phí = thành viên DỰ ÁN + lương TOÀN CỤC của họ (không có → lương 0).
  const employees = useMemo<CostEmployeeRow[]>(() => {
    const rows: CostEmployeeRow[] = [];
    for (const ms of memberships) {
      const m = memberById.get(ms.userId);
      if (!m) continue;
      const comp = compByMember.get(ms.userId);
      rows.push({
        memberId: m.uid,
        name: m.displayName || m.email || m.uid,
        photoURL: m.photoURL,
        jobRole: m.jobRole,
        monthlySalary: comp?.monthlySalary ?? 0,
        startDate: comp?.startDate ?? null,
        endDate: comp?.endDate ?? null,
      });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return rows;
  }, [memberships, memberById, compByMember]);

  // Cửa sổ tính = [tháng hiện tại, +N) — xem anchorMonth (đã từng neo nhầm vào người vào
  // sớm nhất làm cả bảng về 0 ₫).
  const anchor = anchorMonth();
  // MỘT engine theo tháng cho cả thẻ tổng lẫn biểu đồ (lương bậc thang theo dự tính tăng,
  // thưởng Tết, thiết bị/vận hành, dự chi, doanh thu) — hai nơi không bao giờ lệch số.
  const series = useMemo(
    () =>
      buildCostSeries({
        employees,
        plansByMember,
        items,
        memberItemIds,
        projections,
        tetBonusMonths: tetMonths,
        tetBonusMonth: tetMonth,
        revenueByMonth: revenueEffective,
        anchor,
        horizon: months,
      }),
    [employees, plansByMember, items, memberItemIds, projections, tetMonths, tetMonth, revenueEffective, anchor, months],
  );
  // Bảng danh mục vẫn cần thành tiền + số suất TỪNG KHOẢN — cùng luật với engine.
  const overhead = useMemo(
    () => overheadTotal({ items, employees, memberItemIds, projections, anchor, horizon: months }),
    [items, employees, memberItemIds, projections, anchor, months],
  );
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  // Tổng SUẤT tuyển thêm trong dự chi — hiện cạnh số người thật ở bảng lương.
  const hireCount = useMemo(
    () => projections.filter((p) => p.kind === 'hire').reduce((s, p) => s + p.headCount, 0),
    [projections],
  );

  const loading = costsLoading || mLoading || compLoading || planLoading;

  if (loading) {
    return (
      <div className="center-screen" style={{ minHeight: 200 }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <>
      <MonthSlider months={months} onChange={changeMonths} />

      <div className="row cost-view-row">
        <div className="seg-toggle">
          <button className={`seg${cview === 'table' ? ' on' : ''}`} onClick={() => selectCview('table')}>📋 Bảng</button>
          <button className={`seg${cview === 'chart' ? ' on' : ''}`} onClick={() => selectCview('chart')}>📊 Biểu đồ</button>
        </div>
      </div>

      <CostSummary months={months} totals={series.totals} />

      {error && <p className="error-text">{error}</p>}

      {cview === 'chart' && (
        <>
          <CostChart series={series} />
          <RevenueEditor
            series={series}
            revenueByMonth={revenueEffective}
            onCommit={(mIdx, amount) => {
              // Lạc quan: chart đổi ngay, ghi nền, refetch chốt sổ.
              setRevLocal((prev) => new Map(prev).set(mIdx, amount));
              void runOp(
                () => upsertRevenue(projectId, monthIso(mIdx), amount, createdBy).then(refetchRevenue),
                'Lưu doanh thu thất bại (cần quyền admin).',
              );
            }}
          />
        </>
      )}

      {cview === 'table' && (
      <>
      <TetSettingCard
        months={tetMonths}
        payMonth={tetMonth}
        onChange={(patch) => {
          setTetLocal((prev) => ({ ...prev, ...patch }));
          void runOp(
            () => upsertCostSettings(projectId, patch, createdBy).then(refetchSettings),
            'Lưu cấu hình thưởng Tết thất bại (cần quyền admin).',
          );
        }}
      />

      {/* Danh mục chi phí đứng TRÊN bảng lương (yêu cầu): xem danh mục trước, rồi xuống
          bảng lương bấm từng người để gán. */}
      <OverheadTable
        items={items}
        months={months}
        totalByItem={overhead.perItem}
        countByItem={overhead.perItemCount}
        onAdd={() =>
          runOp(() => createItems(() => addCostItem(projectId, createdBy)), 'Thêm khoản chi phí thất bại (cần quyền admin).')}
        onSeed={() =>
          runOp(() => createItems(() => seedDefaultCostItems(projectId, createdBy)), 'Thêm mẫu chi phí thất bại (cần quyền admin).')}
        onUpdate={(id, patch: CostItemPatch) =>
          runOp(
            () => mutateItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)), () => updateCostItem(id, patch)),
            'Cập nhật chi phí thất bại (cần quyền admin).',
          )}
        onDelete={(id) =>
          runOp(
            () => mutateItems((prev) => prev.filter((it) => it.id !== id), () => deleteCostItem(id)),
            'Gỡ khoản chi phí thất bại (cần quyền admin).',
          )}
      />

      <EmployeeCostTable
        employees={employees}
        itemById={itemById}
        memberItemIds={memberItemIds}
        hireCount={hireCount}
        anchor={anchor}
        months={months}
        onPick={(e) => setPicker({ kind: 'member', employee: e })}
      />

      <ProjectionTable
        projections={projections}
        months={months}
        onAdd={(kind: CostProjectionKind) =>
          runOp(() => createProjections(() => addCostProjection(projectId, kind, createdBy)), 'Thêm dự chi thất bại (cần quyền admin).')}
        onUpdate={(id, patch: CostProjectionPatch) =>
          runOp(
            () =>
              mutateProjections((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)), () => updateCostProjection(id, patch)),
            'Cập nhật dự chi thất bại (cần quyền admin).',
          )}
        onDelete={(id) =>
          runOp(
            () => mutateProjections((prev) => prev.filter((p) => p.id !== id), () => deleteCostProjection(id)),
            'Gỡ dự chi thất bại (cần quyền admin).',
          )}
        onPickItems={(p) => setPicker({ kind: 'projection', projection: p })}
      />
      </>
      )}

      {picker?.kind === 'member' && (
        <ItemPickerModal
          title={picker.employee.name}
          hint="Khoản “Ban đầu” tính 1 lần; khoản “Theo năm” tự chia theo số tháng người này làm việc trong khoảng đang xem."
          items={items}
          selectedIds={memberItemIds.get(picker.employee.memberId) ?? []}
          onChange={(ids) =>
            runOp(
              () => setMemberItems(projectId, picker.employee.memberId, ids, createdBy).then(refetchMemberItems),
              'Gán chi phí cho nhân sự thất bại (cần quyền admin).',
            )}
          onClose={() => setPicker(null)}
        />
      )}

      {picker?.kind === 'projection' && (
        <ItemPickerModal
          title={picker.projection.label || COST_PROJECTION_KIND_LABEL[picker.projection.kind]}
          hint={`Mỗi SUẤT (${picker.projection.headCount} người) nhận một bộ khoản đã chọn; khoản “Theo năm” tính đủ khoảng đang xem.`}
          items={items}
          selectedIds={picker.projection.itemIds}
          onChange={(ids) =>
            runOp(
              () =>
                mutateProjections(
                  (prev) => prev.map((p) => (p.id === picker.projection.id ? { ...p, itemIds: ids } : p)),
                  () => updateCostProjection(picker.projection.id, { itemIds: ids }),
                ),
              'Gán chi phí cho dự chi thất bại (cần quyền admin).',
            )}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}
