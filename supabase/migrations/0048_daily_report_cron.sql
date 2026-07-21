-- 0048 — Cron báo cáo task hằng ngày: 10:30 giờ VN = 03:30 UTC, THỨ 2–6 (pg_cron chạy UTC).
-- Gọi Edge Function `daily-report` (đọc Supabase, gửi report vào webhook từng project).
-- Chạy trong hạ tầng Supabase, KHÔNG cần máy nào bật terminal — thay job Python self-host.
--
-- Key gọi lấy từ Vault ('daily_report_invoke_key' = publishable key, công khai) nên KHÔNG
-- nằm trong file này. Tạo bằng: select vault.create_secret('<publishable_key>',
-- 'daily_report_invoke_key'); (đã tạo lúc set up — không commit key).
create extension if not exists pg_net;

-- Đặt lại an toàn khi migration chạy nhiều lần.
do $$ begin perform cron.unschedule('daily-report'); exception when others then null; end $$;

select cron.schedule('daily-report', '30 3 * * 1-5', $CRON$
  select net.http_post(
    url := 'https://vlsskdwcfcmyubyrtwhn.supabase.co/functions/v1/daily-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'daily_report_invoke_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'daily_report_invoke_key')
    ),
    body := '{}'::jsonb,
    -- Timeout mặc định của pg_net là 5s — function cold-start + query DB dễ vượt. Cho 30s.
    timeout_milliseconds := 30000
  );
$CRON$);
