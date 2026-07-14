// Activity writes. Auto events (created / status_change) are logged by DB triggers;
// the client only inserts comments here.

import { supabase } from '../supabase';

export async function addComment(
  taskId: string,
  actorId: string,
  actorName: string,
  body: string,
): Promise<void> {
  const text = body.trim();
  if (!text) return;
  const { error } = await supabase.from('activity').insert({
    task_id: taskId,
    actor_id: actorId,
    actor_name: actorName,
    type: 'comment',
    body: text,
  });
  if (error) throw error;
}
