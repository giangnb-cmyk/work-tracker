-- Admin tao member tay TRUOC (Discord-only, xem 0005), sau do chinh nguoi do dang nhap
-- Google -> sinh ra ho so THU HAI cung email. Thuc te da xay ra: dinhtnn@easygoing.vn co
-- 2 dong, 14 task + 136 bug bam dong cu, 2 task moi bam dong moi -> du lieu tach doi dan.
--
-- Goc loi: handle_new_user dung `on conflict (id) do nothing` — chi nhin ID. Dong tao tay
-- mang uuid ngau nhien (0005 dat default gen_random_uuid) nen KHONG BAO GIO dung id voi
-- auth uid -> khong conflict -> insert moi.
--
-- Vi sao phai DOI ID chu khong giu nguyen dong cu: moi policy RLS deu dua tren auth.uid()
-- (is_admin() = `where id = auth.uid()`). Ho so mang id khac auth uid thi nguoi do dang
-- nhap vao se khong co ho so va mat luon quyen admin.

-- ---------------------------------------------------------------------------
-- 1. FK: cho phep doi profiles.id lan sang cac bang tham chieu
-- ---------------------------------------------------------------------------
-- 15 FK tro vao profiles.id deu dang ON UPDATE NO ACTION -> doi id la loi rang buoc.
-- Duyet catalog thay vi liet ke tay: bo sot mot cai la doi id that bai giua chung.
-- GIU NGUYEN delete rule cua tung cai (set null / cascade / ...) — chi doi update rule.
do $$
declare
  r record;
begin
  for r in
    select
      con.conname,
      src_ns.nspname  as src_schema,
      src.relname     as src_table,
      att.attname     as src_col,
      con.confdeltype as del_rule
    from pg_constraint con
    join pg_class src        on src.oid = con.conrelid
    join pg_namespace src_ns on src_ns.oid = src.relnamespace
    join pg_class tgt        on tgt.oid = con.confrelid
    join pg_namespace tgt_ns on tgt_ns.oid = tgt.relnamespace
    join unnest(con.conkey) with ordinality as k(attnum, ord) on true
    join pg_attribute att    on att.attrelid = src.oid and att.attnum = k.attnum
    where con.contype = 'f'
      and tgt_ns.nspname = 'public'
      and tgt.relname = 'profiles'
      and con.confupdtype = 'a'          -- 'a' = NO ACTION
  loop
    execute format('alter table %I.%I drop constraint %I', r.src_schema, r.src_table, r.conname);
    execute format(
      'alter table %I.%I add constraint %I foreign key (%I) references public.profiles (id) '
      || 'on update cascade on delete %s',
      r.src_schema, r.src_table, r.conname, r.src_col,
      case r.del_rule
        when 'c' then 'cascade'
        when 'n' then 'set null'
        when 'd' then 'set default'
        when 'r' then 'restrict'
        else 'no action'
      end
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Gop cac ho so trung email da lo sinh ra
-- ---------------------------------------------------------------------------
-- Nguoi song sot = dong CO trong auth.users: do moi la danh tinh dang nhap that, va RLS
-- bam theo no. Dong tao tay (khong co trong auth.users) nhuong id nhung GIU lai du lieu
-- admin da dien (discord_id, notion_user_id, role, job_role) — do la toan bo ly do no ton tai.
do $$
declare
  d        record;
  fk       record;
  v_keep   uuid;
  v_drop   uuid;
  v_disc   text;
  v_notion text;
  v_role   public.user_role;
  v_job    public.job_role;
  v_made   timestamptz;
begin
  for d in
    select lower(email) as em
    from public.profiles
    where email <> ''
    group by lower(email)
    having count(*) > 1
  loop
    -- Uu tien dong co trong auth.users; khong co thi lay dong cu nhat lam chuan.
    select p.id into v_keep
    from public.profiles p
    where lower(p.email) = d.em and exists (select 1 from auth.users u where u.id = p.id)
    order by p.created_at
    limit 1;

    if v_keep is null then
      select p.id into v_keep from public.profiles p
      where lower(p.email) = d.em order by p.created_at limit 1;
    end if;

    for v_drop in
      select p.id from public.profiles p where lower(p.email) = d.em and p.id <> v_keep
    loop
      -- Nhat du lieu cua dong sap bo TRUOC khi xoa.
      select discord_id, notion_user_id, role, job_role, created_at
        into v_disc, v_notion, v_role, v_job, v_made
      from public.profiles where id = v_drop;

      -- Doi moi tham chieu sang nguoi song sot. Duyet catalog cho khoi sot bang nao.
      for fk in
        select src_ns.nspname as s, src.relname as t, att.attname as c
        from pg_constraint con
        join pg_class src        on src.oid = con.conrelid
        join pg_namespace src_ns on src_ns.oid = src.relnamespace
        join pg_class tgt        on tgt.oid = con.confrelid
        join pg_namespace tgt_ns on tgt_ns.oid = tgt.relnamespace
        join unnest(con.conkey) with ordinality as k(attnum, ord) on true
        join pg_attribute att    on att.attrelid = src.oid and att.attnum = k.attnum
        where con.contype = 'f' and tgt_ns.nspname = 'public' and tgt.relname = 'profiles'
      loop
        execute format('update %I.%I set %I = $1 where %I = $2', fk.s, fk.t, fk.c, fk.c)
          using v_keep, v_drop;
      end loop;

      -- XOA truoc roi moi ghi discord_id sang nguoi song sot: cot do co rang buoc unique
      -- (0017), ghi khi dong cu con giu la vi pham ngay.
      delete from public.profiles where id = v_drop;

      update public.profiles
      set discord_id     = coalesce(nullif(discord_id, ''), nullif(v_disc, '')),
          notion_user_id = coalesce(nullif(notion_user_id, ''), nullif(v_notion, '')),
          -- Khong bao gio ha quyen khi gop: admin o bat ky dong nao thi ket qua la admin.
          role           = case when role = 'admin' or v_role = 'admin' then 'admin'::public.user_role else role end,
          job_role       = coalesce(job_role, v_job),
          created_at     = least(created_at, v_made)
      where id = v_keep;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. handle_new_user: khop theo EMAIL truoc, khong chi ID
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_existing uuid;
  v_name     text;
  v_photo    text;
begin
  v_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    ''
  );
  v_photo := coalesce(
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(new.raw_user_meta_data ->> 'picture', ''),
    ''
  );

  -- Da co ho so cung email (admin tao tay tu truoc)? -> NHAN LAI dong do, dung tao moi.
  -- So sanh lower(): Google tra email chu thuong, admin go tay co the hoa lan lon.
  -- Bo qua email rong: 0001 dat default '' nen nhieu member Discord-only deu rong —
  -- gop chung lai la gop nham nguoi.
  select id into v_existing
  from public.profiles
  where email <> '' and lower(email) = lower(coalesce(new.email, ''))
  limit 1;

  if v_existing is not null then
    -- Doi id sang auth uid. ON UPDATE CASCADE (buoc 1) keo task/bug/activity... di theo
    -- nen lich su cua nguoi do khong bi bo lai o id cu.
    if v_existing <> new.id then
      update public.profiles set id = new.id where id = v_existing;
    end if;
    -- CHI cap nhat ten + anh. discord_id / notion_user_id / role / job_role admin da dat
    -- deu giu nguyen — do la toan bo ly do cua viec tao member tay tu truoc.
    update public.profiles
    set display_name = coalesce(nullif(v_name, ''), display_name),
        photo_url    = coalesce(nullif(v_photo, ''), photo_url),
        email        = coalesce(new.email, email)
    where id = new.id;
    return new;
  end if;

  insert into public.profiles (id, email, display_name, photo_url)
  values (new.id, coalesce(new.email, ''), v_name, v_photo)
  on conflict (id) do nothing;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Chan cung o DB: mot email = mot ho so
-- ---------------------------------------------------------------------------
-- Trigger tren chi chan duong DANG NHAP. Duong nguoc lai — admin tao tay mot member trung
-- email voi nguoi da dang nhap — van lot. Index nay chan ca hai, va bien loi thanh mot
-- thong bao ngay luc bam Luu thay vi am tham nhan doi du lieu.
--
-- Partial: email rong (default cua 0001) khong tinh la trung — nhieu member Discord-only
-- co the cung rong.
create unique index if not exists profiles_email_unique_idx
  on public.profiles (lower(email))
  where email <> '';

comment on index public.profiles_email_unique_idx is
  'Mot email = mot ho so. Chan ho so trung khi admin tao tay nguoi da co tai khoan (va nguoc lai).';
