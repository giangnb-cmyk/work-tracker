-- Media + deep-link support for bugs synced from Discord.
-- attachments: images/videos/files from the forum post, re-uploaded to Storage
--   (Discord CDN URLs expire, so we mirror them into the public 'attachments' bucket).
-- discord_guild_id: with discord_thread_id, lets the web build a Discord deep link.
alter table public.bugs add column attachments jsonb not null default '[]';
alter table public.bugs add column discord_guild_id text;
