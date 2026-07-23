// useCostPlanning — dữ liệu KẾ HOẠCH tài chính cho tab Chi phí (0059), LIVE:
//   1) project_cost_settings — thưởng Tết của dự án (1 dòng, thiếu = mặc định 1 tháng/tháng 1).
//   2) project_revenue      — doanh thu dự kiến theo tháng (map chỉ số tháng → tiền).
//   3) member_salary_plan   — bậc dự tính tăng lương, TOÀN CỤC theo người (map member → bậc).
// Tất cả RLS admin-only — member gọi vào chỉ nhận rỗng.

import { useCallback, useMemo } from 'react';
import { supabase } from '../supabase';
import { rowToCostSettings, rowToRevenueEntry, rowToSalaryPlan } from '../lib/mappers';
import { monthIndex, type PlanStep } from '../lib/projectCost';
import type { CostSettings, RevenueEntry, SalaryPlanRow } from '../types';
import { useLiveQuery } from './useLiveQuery';

const DEFAULT_SETTINGS: Omit<CostSettings, 'projectId'> = { tetBonusMonths: 1, tetBonusMonth: 1 };

export function useCostPlanning(projectId: string | null) {
  const pid = projectId ?? '';
  const filter = projectId ? `project_id=eq.${projectId}` : undefined;
  const enabled = Boolean(projectId);

  const settingsFetcher = useCallback(async () => {
    const { data, error } = await supabase.from('project_cost_settings').select('*').eq('project_id', pid);
    if (error) throw error;
    return (data ?? []).map(rowToCostSettings);
  }, [pid]);

  const revenueFetcher = useCallback(async () => {
    const { data, error } = await supabase.from('project_revenue').select('*').eq('project_id', pid);
    if (error) throw error;
    return (data ?? []).map(rowToRevenueEntry);
  }, [pid]);

  const plansFetcher = useCallback(async () => {
    const { data, error } = await supabase
      .from('member_salary_plan')
      .select('*')
      .order('effective_from', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToSalaryPlan);
  }, []);

  const { data: settingsRows, loading: sLoading, refetch: refetchSettings } = useLiveQuery<CostSettings>({
    table: 'project_cost_settings',
    fetcher: settingsFetcher,
    filter,
    deps: [pid],
    enabled,
  });

  const { data: revenueRows, loading: rLoading, refetch: refetchRevenue } = useLiveQuery<RevenueEntry>({
    table: 'project_revenue',
    fetcher: revenueFetcher,
    filter,
    deps: [pid],
    enabled,
  });

  const { data: planRows, loading: pLoading } = useLiveQuery<SalaryPlanRow>({
    table: 'member_salary_plan',
    fetcher: plansFetcher,
    deps: [enabled],
    enabled,
  });

  const settings: Omit<CostSettings, 'projectId'> = settingsRows[0] ?? DEFAULT_SETTINGS;

  /** Chỉ số tháng tuyệt đối → doanh thu dự kiến. */
  const revenueByMonth = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of revenueRows) {
      const mi = monthIndex(r.month);
      if (mi != null) map.set(mi, r.amount);
    }
    return map;
  }, [revenueRows]);

  /** memberId → các bậc tăng lương dự tính (đã sắp theo ngày hiệu lực). */
  const plansByMember = useMemo(() => {
    const map = new Map<string, PlanStep[]>();
    for (const p of planRows) {
      const list = map.get(p.memberId) ?? [];
      list.push({ effectiveFrom: p.effectiveFrom, monthlySalary: p.monthlySalary });
      map.set(p.memberId, list);
    }
    return map;
  }, [planRows]);

  return {
    settings,
    revenueByMonth,
    plansByMember,
    refetchSettings,
    refetchRevenue,
    loading: sLoading || rLoading || pLoading,
  };
}
