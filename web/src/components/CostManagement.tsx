import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useProjectCosts } from '../hooks/useProjectCosts';
import {
  addCostItem,
  addCostProjection,
  deleteCostItem,
  deleteCostProjection,
  seedDefaultCostItems,
  updateCostItem,
  updateCostProjection,
  type CostItemPatch,
  type CostProjectionPatch,
} from '../lib/costWrites';
import { anchorMonth, overheadTotal, projectionTotal, salaryTotal } from '../lib/projectCost';
import type { CostProjectionKind } from '../types';
import CostSummary from './cost/CostSummary';
import EmployeeCostTable from './cost/EmployeeCostTable';
import MonthSlider from './cost/MonthSlider';
import OverheadTable from './cost/OverheadTable';
import ProjectionTable from './cost/ProjectionTable';

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
  const { employees, items, projections, loading } = useProjectCosts(projectId);

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

  const headcount = employees.length;
  const anchor = useMemo(() => anchorMonth(employees), [employees]);
  const salary = useMemo(() => salaryTotal(employees, anchor, months), [employees, anchor, months]);
  const overhead = useMemo(() => overheadTotal(items, headcount, months), [items, headcount, months]);
  const projection = useMemo(() => projectionTotal(projections, months), [projections, months]);

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

      <EmployeeCostTable employees={employees} memberById={memberById} anchor={anchor} months={months} />

      <OverheadTable
        items={items}
        headcount={headcount}
        months={months}
        onAdd={() => runOp(() => addCostItem(projectId, createdBy), 'Thêm khoản chi phí thất bại (cần quyền admin).')}
        onSeed={() => runOp(() => seedDefaultCostItems(projectId, createdBy), 'Thêm mẫu chi phí thất bại (cần quyền admin).')}
        onUpdate={(id, patch: CostItemPatch) => runOp(() => updateCostItem(id, patch), 'Cập nhật chi phí thất bại (cần quyền admin).')}
        onDelete={(id) => runOp(() => deleteCostItem(id), 'Gỡ khoản chi phí thất bại (cần quyền admin).')}
      />

      <ProjectionTable
        projections={projections}
        months={months}
        onAdd={(kind: CostProjectionKind) => runOp(() => addCostProjection(projectId, kind, createdBy), 'Thêm dự chi thất bại (cần quyền admin).')}
        onUpdate={(id, patch: CostProjectionPatch) => runOp(() => updateCostProjection(id, patch), 'Cập nhật dự chi thất bại (cần quyền admin).')}
        onDelete={(id) => runOp(() => deleteCostProjection(id), 'Gỡ dự chi thất bại (cần quyền admin).')}
      />
    </>
  );
}
