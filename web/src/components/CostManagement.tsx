import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSprintContext } from '../contexts/SprintContext';
import { useProjectMembers } from '../hooks/useProjectMembers';
import { useProjectCosts } from '../hooks/useProjectCosts';
import {
  addCostEmployee,
  addCostItem,
  addCostProjection,
  deleteCostEmployee,
  deleteCostItem,
  deleteCostProjection,
  seedDefaultCostItems,
  updateCostEmployee,
  updateCostItem,
  updateCostProjection,
  type CostEmployeePatch,
  type CostItemPatch,
  type CostProjectionPatch,
} from '../lib/costWrites';
import { anchorMonth, overheadTotal, projectionTotal, salaryTotal } from '../lib/projectCost';
import type { CostProjectionKind, TeamMember } from '../types';
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
 * Tab "Chi phí" (Quản trị) — tính chi phí một dự án: lương thực tế, thiết bị/vận hành, và
 * DỰ CHI (tuyển thêm + outsource), gộp theo một khoảng THÁNG kéo bằng slider. Admin-only cả
 * ở nav lẫn RLS (dữ liệu lương nhạy cảm).
 */
export default function CostManagement() {
  const { profile } = useAuth();
  const { members, membersLoading, selectedProjectId, selectedProject } = useSprintContext();
  const { memberships, loading: membershipsLoading } = useProjectMembers(selectedProjectId);
  const { employees, items, projections, loading: costsLoading } = useProjectCosts(selectedProjectId);

  const [months, setMonths] = useState(readMonths);
  const [error, setError] = useState<string | null>(null);

  const createdBy = profile?.uid ?? null;
  const pid = selectedProjectId;

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

  // Thành viên dự án CHƯA có dòng lương — nguồn cho ô "Thêm từ thành viên".
  const availableMembers = useMemo(() => {
    const taken = new Set(employees.map((e) => e.memberId));
    return memberships
      .map((ms) => memberById.get(ms.userId))
      .filter((m): m is TeamMember => Boolean(m) && !taken.has((m as TeamMember).uid));
  }, [memberships, memberById, employees]);

  const headcount = employees.length;
  const anchor = useMemo(() => anchorMonth(employees), [employees]);
  const salary = useMemo(() => salaryTotal(employees, anchor, months), [employees, anchor, months]);
  const overhead = useMemo(() => overheadTotal(items, headcount, months), [items, headcount, months]);
  const projection = useMemo(() => projectionTotal(projections, months), [projections, months]);

  if (membersLoading || membershipsLoading || costsLoading) {
    return (
      <div className="center-screen" style={{ minHeight: 200 }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!pid) {
    return <div className="glass empty">Hãy chọn một dự án để tính chi phí.</div>;
  }

  return (
    <div className="fade-in">
      <div className="view-header">
        <h1>Chi phí dự án</h1>
        <p>
          Tính tổng chi phí của “{selectedProject?.name ?? 'dự án'}” trong một khoảng thời gian: lương nhân sự,
          thiết bị/vận hành, và dự chi. Chỉ admin xem được.
        </p>
      </div>

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

      <EmployeeCostTable
        employees={employees}
        memberById={memberById}
        available={availableMembers}
        anchor={anchor}
        months={months}
        onAdd={(memberId) => runOp(() => addCostEmployee(pid, memberId, createdBy), 'Thêm nhân sự thất bại (cần quyền admin).')}
        onUpdate={(id, patch: CostEmployeePatch) => runOp(() => updateCostEmployee(id, patch), 'Cập nhật lương thất bại (cần quyền admin).')}
        onDelete={(id) => runOp(() => deleteCostEmployee(id), 'Gỡ nhân sự thất bại (cần quyền admin).')}
      />

      <OverheadTable
        items={items}
        headcount={headcount}
        months={months}
        onAdd={() => runOp(() => addCostItem(pid, createdBy), 'Thêm khoản chi phí thất bại (cần quyền admin).')}
        onSeed={() => runOp(() => seedDefaultCostItems(pid, createdBy), 'Thêm mẫu chi phí thất bại (cần quyền admin).')}
        onUpdate={(id, patch: CostItemPatch) => runOp(() => updateCostItem(id, patch), 'Cập nhật chi phí thất bại (cần quyền admin).')}
        onDelete={(id) => runOp(() => deleteCostItem(id), 'Gỡ khoản chi phí thất bại (cần quyền admin).')}
      />

      <ProjectionTable
        projections={projections}
        months={months}
        onAdd={(kind: CostProjectionKind) => runOp(() => addCostProjection(pid, kind, createdBy), 'Thêm dự chi thất bại (cần quyền admin).')}
        onUpdate={(id, patch: CostProjectionPatch) => runOp(() => updateCostProjection(id, patch), 'Cập nhật dự chi thất bại (cần quyền admin).')}
        onDelete={(id) => runOp(() => deleteCostProjection(id), 'Gỡ dự chi thất bại (cần quyền admin).')}
      />
    </div>
  );
}
