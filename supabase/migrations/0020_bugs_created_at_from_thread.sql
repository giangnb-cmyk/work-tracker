-- Bug dong bo tu Discord phai mang NGAY BAO BUG (luc tao bai post), khong phai ngay bot
-- sync. `_upsert_bugs` truoc day insert ma khong set created_at -> roi ve `default now()`,
-- nen bug post thang 3 ma sync thang 7 se hien la thang 7 (vd #633: post 24/03, hien 16/07).
--
-- skills/bug_sync.py da sua de ghi created_at tu thread (ca luc insert lan update), file
-- nay va lai 600+ dong da sync sai truoc do — khong phai cho den lan sync 09h ke tiep.
--
-- Nguon moc: chinh `discord_thread_id`. Snowflake Discord nhung so ms ke tu Discord epoch
-- (2015-01-01) vao 42 bit cao; voi bai forum thi thread id duoc sinh dung luc post, nen
-- giai ma ra chinh xac ngay bao bug ma khong can goi lai Discord API.

-- Khong co begin/commit: Supabase MCP `apply_migration` da tu boc transaction.

-- Trigger touch_updated_at se dap now() len updated_at cua ca 600+ dong. Tat trong luc
-- backfill roi bat lai — day la sua lai qua khu, khong phai mot lan sua that.
alter table public.bugs disable trigger bugs_touch_updated_at;

update public.bugs b
set created_at = d.snow
from (
  select id,
         to_timestamp(((((discord_thread_id)::bigint) >> 22) + 1420070400000) / 1000.0) as snow
  from public.bugs
  where discord_thread_id is not null
    and discord_thread_id <> ''
    -- Thread id luon la so. Co gi khac (du lieu tay, bug app-only) thi bo qua con hon doan.
    and discord_thread_id ~ '^[0-9]+$'
) d
where b.id = d.id
  -- Chi cham dong that su lech (>1h) -> chay lai file nay la no-op.
  and abs(extract(epoch from (b.created_at - d.snow))) > 3600;

alter table public.bugs enable trigger bugs_touch_updated_at;
