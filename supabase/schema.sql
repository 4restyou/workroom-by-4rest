create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamp with time zone default now()
);

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  pass_type text not null,
  date date not null,
  start_time time,
  end_time time,
  people integer default 1,
  message text,
  status text default 'pending' check (status in ('pending', 'confirmed', 'canceled', 'completed')),
  admin_note text,
  created_at timestamp with time zone default now()
);

create table if not exists passes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price integer not null,
  is_active boolean default true,
  sort_order integer default 0,
  created_at timestamp with time zone default now()
);

alter table profiles enable row level security;
alter table reservations enable row level security;
alter table passes enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

drop policy if exists "profiles_select_own_or_admin" on profiles;
create policy "profiles_select_own_or_admin"
on profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "passes_public_read_active" on passes;
create policy "passes_public_read_active"
on passes
for select
to anon, authenticated
using (is_active = true or public.is_admin());

drop policy if exists "passes_admin_all" on passes;
create policy "passes_admin_all"
on passes
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "reservations_public_insert" on reservations;
create policy "reservations_public_insert"
on reservations
for insert
to anon, authenticated
with check (
  status = 'pending'
  and name <> ''
  and phone <> ''
  and pass_type <> ''
);

drop policy if exists "reservations_admin_read" on reservations;
create policy "reservations_admin_read"
on reservations
for select
to authenticated
using (public.is_admin());

drop policy if exists "reservations_admin_update" on reservations;
create policy "reservations_admin_update"
on reservations
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "reservations_admin_delete" on reservations;
create policy "reservations_admin_delete"
on reservations
for delete
to authenticated
using (public.is_admin());

insert into passes (name, description, price, sort_order)
values
  ('1시간권', '1시간 이용', 4000, 1),
  ('종일권 라이트', '평일 09:00-18:00', 30000, 2),
  ('종일권 스탠다드', '평일 09:00-21:00', 40000, 3),
  ('주간권 라이트', '월-금 09:00-18:00', 99000, 4),
  ('주간권 스탠다드', '월-금 09:00-21:00', 139000, 5),
  ('월권 자유석', '4주 기준 / 비지정석', 199000, 6),
  ('월권 지정석', '4주 기준 / 지정석', 299000, 7)
on conflict do nothing;

-- 관리자 계정 생성 후 auth.users의 id를 확인해 아래 예시처럼 등록합니다.
-- insert into profiles (id, email, role)
-- values ('AUTH_USER_UUID', 'admin@example.com', 'admin')
-- on conflict (id) do update set role = 'admin', email = excluded.email;
