// Ghi thư viện tài liệu dự án (`project_docs`, migration 0066). Tách khỏi React để tab
// Tài liệu, TaskModal và FeatureModal dùng chung một đường ghi.

import { supabase } from '../supabase';
import { detectProvider, makeLinkAttachment } from './attachments';
import type { Attachment, ProjectDoc, ProjectDocInput } from '../types';

/** Lỗi trùng link trong cùng dự án (unique index project_docs_project_url_key). */
const DUPLICATE_CODE = '23505';

export class DuplicateDocError extends Error {
  constructor() {
    super('Link này đã có trong thư viện của dự án.');
    this.name = 'DuplicateDocError';
  }
}

/** Chuẩn hoá đầu vào form: tên rỗng thì lấy host của URL làm tên. */
function toRow(input: ProjectDocInput) {
  const url = input.url.trim();
  return {
    name: input.name.trim() || new URL(url).hostname.replace(/^www\./, ''),
    url,
    provider: detectProvider(url),
    description: input.description.trim(),
    category: input.category.trim(),
  };
}

export async function createProjectDoc(
  projectId: string,
  input: ProjectDocInput,
  createdBy: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('project_docs')
    // created_by PHẢI là chính người gọi — RLS project_docs_insert chốt điều kiện này,
    // truyền sai (hoặc rỗng) là bị từ chối chứ không âm thầm ghi.
    .insert({ project_id: projectId, created_by: createdBy, ...toRow(input) })
    .select('id')
    .single();
  if (error) throw error.code === DUPLICATE_CODE ? new DuplicateDocError() : error;
  return data.id as string;
}

export async function updateProjectDoc(id: string, input: ProjectDocInput): Promise<void> {
  const { error } = await supabase.from('project_docs').update(toRow(input)).eq('id', id);
  if (error) throw error.code === DUPLICATE_CODE ? new DuplicateDocError() : error;
}

export async function deleteProjectDoc(id: string): Promise<void> {
  const { error } = await supabase.from('project_docs').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Một mục thư viện → attachment để đính vào task/feature.
 *
 * COPY chứ không trỏ: `Attachment.id` sinh mới nên xoá mục khỏi thư viện sau này không làm
 * task cũ mất tài liệu (xem chú thích ở migration 0066). Tên lấy theo thư viện — đó chính
 * là điểm của thư viện: một cái tên tử tế thay cho URL trần.
 */
export function docToAttachment(doc: ProjectDoc): Attachment {
  return makeLinkAttachment(doc.url, doc.name);
}
