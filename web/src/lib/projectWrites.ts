// Admin-only project writes. RLS requires admin. A project may link to a Notion
// project (notionProjectId) so task syncs set the Notion "Project" relation.

import { supabase } from '../supabase';
import type { Project } from '../types';

export interface ProjectInput {
  name: string;
  icon: string;
  color: string;
  description: string;
  notionProjectId: string | null;
  weeklySheetId: string | null;
  dailyReportWebhook?: string | null;
}

/**
 * Bóc spreadsheet id ra khỏi link Google Sheet người dùng dán.
 *
 * Chỉ lưu ID chứ không lưu cả URL: URL còn kèm `/edit#gid=…` và query khác, ghép lại rất
 * dễ sai. Dán thẳng id cũng nhận (chuỗi không chứa `/`).
 */
export function extractSheetId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(s) ? s : null;
}

export async function createProject(input: ProjectInput, createdBy: string): Promise<string> {
  const { data, error } = await supabase
    .from('projects')
    .insert({
      name: input.name.trim(),
      icon: input.icon || '📁',
      color: input.color || '#6366f1',
      description: input.description.trim(),
      notion_project_id: input.notionProjectId,
      weekly_sheet_id: input.weeklySheetId,
      daily_report_webhook: input.dailyReportWebhook ?? null,
      created_by: createdBy || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.icon !== undefined) row.icon = patch.icon;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.notionProjectId !== undefined) row.notion_project_id = patch.notionProjectId;
  if (patch.weeklySheetId !== undefined) row.weekly_sheet_id = patch.weeklySheetId;
  if (patch.dailyReportWebhook !== undefined) row.daily_report_webhook = patch.dailyReportWebhook;
  const { error } = await supabase.from('projects').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}
