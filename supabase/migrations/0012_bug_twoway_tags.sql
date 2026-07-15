-- Two-way tag sync between the app and a Discord forum.
-- 1) Link an app bug_label to its Discord forum tag (stable id, not just name) so
--    app label changes can be written back to the right forum tag.
-- 2) `pending_discord_push` marks a bug whose labels were changed IN THE APP and
--    still need to be pushed to its Discord thread. The bot drains these; the
--    Discord→app sync skips relabeling a bug while this flag is set (app wins).

alter table public.bug_labels add column discord_tag_id text;
create unique index bug_labels_discord_tag_idx
  on public.bug_labels (project_id, discord_tag_id)
  where discord_tag_id is not null;

alter table public.bugs add column pending_discord_push boolean not null default false;
create index bugs_pending_push_idx on public.bugs (pending_discord_push)
  where pending_discord_push;
