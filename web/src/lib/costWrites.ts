// Ghi dữ liệu chi phí. RLS (migration 0053/0054) đòi admin/owner cho MỌI thao tác kể cả đọc
// — member gọi vào chỉ nhận 42501, caller tự hiện thông báo. Naming boundary: app camelCase ↔
// Postgres snake_case, chuyển ngay tại đây.

import { supabase } from '../supabase';
import { rowToCostItem, rowToCostProjection } from './mappers';
import type { CostCadence, CostItem, CostItemKind, CostProjection, CostProjectionKind } from '../types';

/* ----------------------------- Lương nhân sự (toàn cục) ----------------------------- */

export interface MemberCompPatch {
  monthlySalary?: number;
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * Đặt lương + thời gian làm việc của MỘT người (bảng member_compensation, toàn cục — không
 * theo dự án). Điền ở chi tiết thành viên (MemberModal). Tạo dòng nếu chưa có, cập nhật nếu
 * đã có (member_id là khoá chính).
 */
export async function upsertMemberComp(
  memberId: string,
  patch: MemberCompPatch,
  updatedBy: string | null,
): Promise<void> {
  const row: Record<string, unknown> = { member_id: memberId, updated_at: new Date().toISOString(), updated_by: updatedBy };
  if (patch.monthlySalary !== undefined) row.monthly_salary = patch.monthlySalary;
  if (patch.startDate !== undefined) row.start_date = patch.startDate || null;
  if (patch.endDate !== undefined) row.end_date = patch.endDate || null;
  const { error } = await supabase.from('member_compensation').upsert(row, { onConflict: 'member_id' });
  if (error) throw error;
}

/* --------------------------- Chi phí thiết bị/vận hành --------------------------- */

/** Trả về dòng vừa tạo (có id thật) để UI gắn ngay — phục vụ ghi lạc quan (useOptimisticList). */
export async function addCostItem(projectId: string, createdBy: string | null): Promise<CostItem> {
  const { data, error } = await supabase
    .from('project_cost_items')
    .insert({ project_id: projectId, name: '', amount: 0, kind: 'annual', created_by: createdBy })
    .select('*')
    .single();
  if (error) throw error;
  return rowToCostItem(data);
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
): Promise<CostItem[]> {
  const rows = DEFAULT_COST_ITEMS.map((it, i) => ({
    project_id: projectId,
    name: it.name,
    amount: it.amount,
    kind: it.kind,
    sort_order: i,
    created_by: createdBy,
  }));
  const { data, error } = await supabase.from('project_cost_items').insert(rows).select('*');
  if (error) throw error;
  return (data ?? []).map(rowToCostItem);
}

/* -------------------------------- Dự chi (what-if) ------------------------------- */

/** Trả về dòng vừa tạo để UI gắn ngay — phục vụ ghi lạc quan (useOptimisticList). */
export async function addCostProjection(
  projectId: string,
  kind: CostProjectionKind,
  createdBy: string | null,
): Promise<CostProjection> {
  const { data, error } = await supabase
    .from('project_cost_projections')
    .insert({
      project_id: projectId,
      kind,
      label: '',
      amount: 0,
      cadence: kind === 'hire' ? 'monthly' : 'one_time',
      head_count: 1,
      created_by: createdBy,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToCostProjection(data);
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
