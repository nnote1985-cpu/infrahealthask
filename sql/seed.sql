-- ═══════════════════════════════════════════════════════════
-- Supabase Health Monitor — Setup SQL  (seed_version = 2)
-- รันชุดนี้ใน SQL Editor ของทุกโปรเจคที่ต้องการ monitor
-- หากใช้งานผ่าน UI ค่า CHANGE_ME_* จะถูกเติมให้อัตโนมัติ
-- ═══════════════════════════════════════════════════════════

-- ── ตาราง seed สำหรับ read test (dummy ล้วน ไม่มีข้อมูลจริง) ──
create table if not exists public.system_health_seed (
  id integer generated always as identity primary key,
  category text not null,
  value int not null,
  label text
);

insert into public.system_health_seed (category, value, label)
select c, v, c || '-' || v
from (values ('alpha'), ('beta'), ('gamma')) as t(c),
     generate_series(50, 250, 50) as v
where not exists (select 1 from public.system_health_seed);

-- ── ตาราง counter สำหรับ write test ──
create table if not exists public.health_check (
  id int primary key default 1,
  project_name text,
  supabase_ref text,
  ping_count bigint not null default 0,
  last_ping timestamptz not null default now(),
  setup_at timestamptz not null default now(),
  seed_version int not null default 2,
  constraint single_row check (id = 1)
);

-- 👇 หากรันเองให้แก้ค่า CHANGE_ME_NAME และ CHANGE_ME_REF
insert into public.health_check (id, project_name, supabase_ref)
values (1, 'CHANGE_ME_NAME', 'CHANGE_ME_REF')
on conflict (id) do nothing;

-- ── Row Level Security ──
alter table public.system_health_seed enable row level security;
alter table public.health_check enable row level security;

drop policy if exists "anon read seed" on public.system_health_seed;
create policy "anon read seed" on public.system_health_seed
  for select to anon using (true);
-- health_check: ไม่มี policy ใดๆ → anon แตะ table ตรงๆ ไม่ได้ ต้องผ่าน RPC เท่านั้น

-- ── RPC: read + write อะตอมมิก, rate-limited, ไม่เปิดเผย project_name ──
create or replace function public.health_ping()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.health_check;
  seed_ok boolean;
begin
  select exists(select 1 from public.system_health_seed) into seed_ok;

  -- rate limit: ข้าม write หาก ping ล่าสุดยังไม่ถึง 15 นาที (ป้องกัน counter spam)
  update public.health_check
     set ping_count = ping_count + 1,
         last_ping = now()
   where id = 1
     and last_ping < now() - interval '15 minutes'
  returning * into r;

  -- ถ้า rate limit ยิง (ยังไม่ถึง 15 นาที): อ่าน row ปัจจุบันแทน
  if r is null then
    select * into r from public.health_check where id = 1;
  end if;

  -- ถ้าไม่มี row id=1 เลย: seed SQL ยังรันไม่ครบ
  if r is null then
    raise exception 'health_check row missing — re-run seed SQL' using errcode = 'P0002';
  end if;

  return json_build_object(
    'ok', true,
    'count', r.ping_count,
    'last_ping', r.last_ping,
    'seed_ok', seed_ok,
    'db_time', now()
  );
end;
$$;

revoke all on function public.health_ping() from public;
grant execute on function public.health_ping() to anon;

-- ── Migration: เพิ่ม column ถ้าติดตั้งจาก seed_version เก่า (v1 → v2) ──
alter table public.health_check add column if not exists supabase_ref text;
alter table public.health_check add column if not exists setup_at timestamptz not null default now();
alter table public.health_check add column if not exists seed_version int not null default 2;

-- ── Uninstall (comment ออก ใช้เฉพาะเมื่อต้องการถอน) ──
-- drop function if exists public.health_ping();
-- drop table if exists public.health_check;
-- drop table if exists public.system_health_seed;
