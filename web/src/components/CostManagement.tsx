import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useProjectCosts } from '../hooks/useProjectCosts';
import { useProjectMembers } from '../hooks/useProjectMembers';
import { useMemberComp } from '../hooks/useMemberComp';
import { useOptimisticList } from '../hooks/useOptimisticList';
import {
  addCostItem,
  addCostProjection,
  deleteCostItem,
  deleteCostProjection,
  seedDefaultCostItems,
  setMemberItems,
  updateCostItem,
  updateCostProjection,
  type CostItemPatch,
  type CostProjectionPatch,
} from '../lib/costWrites';
import { anchorMonth, overheadTotal, projectionTotal, salaryTotal } from '../lib/projectCost';
import { COST_PROJECTION_KIND_LABEL, type CostEmployeeRow, type CostProjection, type CostProjectionKind } from '../types';
import CostSummary from './cost/CostSummary';
import EmployeeCostTable from './cost/EmployeeCostTable';
import ItemPickerModal from './cost/ItemPickerModal';
import MonthSlider from './cost/MonthSlider';
import OverheadTable from './cost/OverheadTable';
import ProjectionTable from './cost/ProjectionTable';

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
  const [picker, setPicker] = useState<PickerTarget | null>(null);

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
        monthlySalary: comp?.monthlySalary ?? 0,
        startDate: comp?.startDate ?? null,
        endDate: comp?.endDate ?? null,
      });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return rows;
  }, [memberships, memberById, compByMember]);

  const headcount = employees.length;
  // Cửa sổ tính = [tháng hiện tại, +N) — xem anchorMonth (đã từng neo nhầm vào người vào
  // sớm nhất làm cả bảng về 0 ₫).
  const anchor = anchorMonth();
  const salary = useMemo(() => salaryTotal(employees, anchor, months), [employees, anchor, months]);
  // Thiết bị/vận hành theo mô hình GÁN THEO NGƯỜI (0056): khoản gán ai tính theo người đó
  // (annual chia theo tháng làm việc), khoản chưa gán tính một suất chung.
  const overhead = useMemo(
    () => overheadTotal({ items, employees, memberItemIds, projections, anchor, horizon: months }),
    [items, employees, memberItemIds, projections, anchor, months],
  );
  const projection = useMemo(() => projectionTotal(projections, months), [projections, months]);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const loading = costsLoading || mLoading || compLoading;

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

      <CostSummary
        headcount={headcount}
        months={months}
        salary={salary}
        oneTime={overhead.oneTime}
        annual={overhead.annual}
        projection={projection}
      />

      {error && <p className="error-text">{error}</p>}

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
