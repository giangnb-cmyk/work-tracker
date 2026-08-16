// Ghi thư viện tài liệu dự án (`project_docs`, migration 0066). Tách khỏi React để tab
// Tài liệu, TaskModal và FeatureModal dùng chung một đường ghi.

import { supabase } from '../supabase';
import { detectProvider, makeLinkAttachment } from './attachments';
import { notifyDocCreated } from './discordNotify';
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
  const row = toRow(input);
  const { data, error } = await supabase
    .from('project_docs')
    // created_by PHẢI là chính người gọi — RLS project_docs_insert chốt điều kiện này,
    // truyền sai (hoặc rỗng) là bị từ chối chứ không âm thầm ghi.
    .insert({ project_id: projectId, created_by: createdBy, ...row })
    .select('id')
    .single();
  if (error) throw error.code === DUPLICATE_CODE ? new DuplicateDocError() : error;
  // Báo Discord thư viện vừa có gì — fire-and-forget, cùng chỗ đứng với notifyTaskCreated
  // trong createTask: webhook hỏng không được chặn việc thêm tài liệu. CHỈ lúc tạo, không
  // lúc sửa — sửa tên/nhóm mà cũng bắn tin thì kênh thành nhật ký chỉnh tả.
  void notifyDocCreated({ ...row, projectId, createdBy });
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
 * Ghim / bỏ ghim một tài liệu cho CHÍNH người đang đăng nhập (migration 0067).
 *
 * `user_id` phải là người gọi — RLS chốt điều kiện đó ở cả insert lẫn delete, nên không
 * ghim hộ (hay bỏ ghim của) người khác được.
 */
export async function setDocPinned(docId: string, userId: string, pinned: boolean): Promise<void> {
  if (pinned) {
    const { error } = await supabase
      .from('project_doc_pins')
      // Bấm ghim hai lần (hoặc hai tab cùng bấm) không được ném lỗi trùng khoá chính.
      .upsert({ user_id: userId, doc_id: docId }, { onConflict: 'user_id,doc_id' });
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from('project_doc_pins')
    .delete()
    .eq('user_id', userId)
    .eq('doc_id', docId);
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
