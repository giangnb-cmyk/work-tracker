// Ghi dữ liệu chi phí (3 bảng của tab "Chi phí"). RLS (migration 0053) đòi admin/owner cho
// MỌI thao tác kể cả đọc — member gọi vào chỉ nhận 42501, caller tự hiện thông báo.
// Naming boundary: app camelCase ↔ Postgres snake_case, chuyển ngay tại đây.

import { supabase } from '../supabase';
import type { CostCadence, CostItemKind, CostProjectionKind } from '../types';

/* ------------------------------- Nhân viên (lương) ------------------------------- */

/** Thêm một thành viên vào bảng lương của dự án (idempotent theo unique project+member). */
export async function addCostEmployee(
  projectId: string,
  memberId: string,
  createdBy: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('project_cost_employees')
    .upsert(
      { project_id: projectId, member_id: memberId, created_by: createdBy },
      { onConflict: 'project_id,member_id', ignoreDuplicates: true },
    );
  if (error) throw error;
}

export interface CostEmployeePatch {
  monthlySalary?: number;
  startDate?: string | null;
  endDate?: string | null;
}

export async function updateCostEmployee(id: string, patch: CostEmployeePatch): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.monthlySalary !== undefined) row.monthly_salary = patch.monthlySalary;
  if (patch.startDate !== undefined) row.start_date = patch.startDate || null;
  if (patch.endDate !== undefined) row.end_date = patch.endDate || null;
  const { error } = await supabase.from('project_cost_employees').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteCostEmployee(id: string): Promise<void> {
  const { error } = await supabase.from('project_cost_employees').delete().eq('id', id);
  if (error) throw error;
}

/* --------------------------- Chi phí thiết bị/vận hành --------------------------- */

export async function addCostItem(projectId: string, createdBy: string | null): Promise<void> {
  const { error } = await supabase
    .from('project_cost_items')
    .insert({ project_id: projectId, name: '', amount: 0, kind: 'annual', created_by: createdBy });
  if (error) throw error;
}

export interface CostItemPatch {
  name?: string;
  amount?: number;
  kind?: CostItemKind;
  perEmployee?: boolean;
}

export async function updateCostItem(id: string, patch: CostItemPatch): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.amount !== undefined) row.amount = patch.amount;
  if (patch.kind !== undefined) row.kind = patch.kind;
  if (patch.perEmployee !== undefined) row.per_employee = patch.perEmployee;
  const { error } = await supabase.from('project_cost_items').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteCostItem(id: string): Promise<void> {
  const { error } = await supabase.from('project_cost_items').delete().eq('id', id);
  if (error) throw error;
}

/** Mẫu chi phí lấy từ bảng chi phí gốc (ảnh yêu cầu). Bấm "Thêm mẫu" chèn nguyên loạt. */
const DEFAULT_COST_ITEMS: { name: string; amount: number; kind: CostItemKind }[] = [
  { name: 'Bộ PC', amount: 30_000_000, kind: 'one_time' },
  { name: 'Ghế', amount: 3_200_000, kind: 'one_time' },
  { name: 'Bản quyền win', amount: 5_000_000, kind: 'one_time' },
  { name: 'Thưởng lễ trong năm', amount: 5_000_000, kind: 'annual' },
  { name: 'Phúc lợi', amount: 7_200_000, kind: 'annual' },
  { name: 'Điện', amount: 4_761_905, kind: 'annual' },
  { name: 'Phí dịch vụ', amount: 900_000, kind: 'annual' },
  { name: 'Văn phòng', amount: 20_380_952, kind: 'annual' },
];

/** Chèn nguyên bộ chi phí mẫu cho dự án (một lần .insert — theo chuẩn batch của repo). */
export async function seedDefaultCostItems(
  projectId: string,
  createdBy: string | null,
): Promise<void> {
  const rows = DEFAULT_COST_ITEMS.map((it, i) => ({
    project_id: projectId,
    name: it.name,
    amount: it.amount,
    kind: it.kind,
    sort_order: i,
    created_by: createdBy,
  }));
  const { error } = await supabase.from('project_cost_items').insert(rows);
  if (error) throw error;
}

/* -------------------------------- Dự chi (what-if) ------------------------------- */

export async function addCostProjection(
  projectId: string,
  kind: CostProjectionKind,
  createdBy: string | null,
): Promise<void> {
  const { error } = await supabase.from('project_cost_projections').insert({
    project_id: projectId,
    kind,
    label: '',
    amount: 0,
    cadence: kind === 'hire' ? 'monthly' : 'one_time',
    head_count: 1,
    created_by: createdBy,
  });
  if (error) throw error;
}

export interface CostProjectionPatch {
  label?: string;
  amount?: number;
  cadence?: CostCadence;
  headCount?: number;
}

export async function updateCostProjection(id: string, patch: CostProjectionPatch): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) row.label = patch.label;
  if (patch.amount !== undefined) row.amount = patch.amount;
  if (patch.cadence !== undefined) row.cadence = patch.cadence;
  if (patch.headCount !== undefined) row.head_count = patch.headCount;
  const { error } = await supabase.from('project_cost_projections').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteCostProjection(id: string): Promise<void> {
  const { error } = await supabase.from('project_cost_projections').delete().eq('id', id);
  if (error) throw error;
}
