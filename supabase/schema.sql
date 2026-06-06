create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  address text,
  role text not null default 'user' check (role in ('admin', 'user')),
  membership_status text not null default 'approved' check (membership_status in ('pending', 'approved', 'rejected')),
  created_at timestamp with time zone default now()
);

alter table profiles add column if not exists full_name text;
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists address text;
alter table profiles add column if not exists membership_status text not null default 'approved';
alter table profiles alter column membership_status set default 'approved';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_membership_status_check'
  ) then
    alter table profiles
    add constraint profiles_membership_status_check
    check (membership_status in ('pending', 'approved', 'rejected'));
  end if;
end;
$$;

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
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

alter table reservations add column if not exists profile_id uuid references profiles(id) on delete set null;

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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.prevent_member_privilege_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.role = old.role;
    new.membership_status = old.membership_status;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_member_privilege_update on profiles;
create trigger prevent_member_privilege_update
before update on profiles
for each row execute function public.prevent_member_privilege_update();

create or replace function public.update_my_profile(
  p_full_name text,
  p_phone text,
  p_address text
)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile profiles;
begin
  update public.profiles
  set
    full_name = nullif(trim(p_full_name), ''),
    phone = nullif(trim(p_phone), ''),
    address = nullif(trim(p_address), '')
  where id = auth.uid()
  returning * into updated_profile;

  if updated_profile.id is null then
    insert into public.profiles (id, email, full_name, phone, address)
    values (
      auth.uid(),
      coalesce((auth.jwt() ->> 'email'), ''),
      nullif(trim(p_full_name), ''),
      nullif(trim(p_phone), ''),
      nullif(trim(p_address), '')
    )
    returning * into updated_profile;
  end if;

  return updated_profile;
end;
$$;

drop policy if exists "profiles_select_own_or_admin" on profiles;
create policy "profiles_select_own_or_admin"
on profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own"
on profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own"
on profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "profiles_admin_update" on profiles;
create policy "profiles_admin_update"
on profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

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
  and (profile_id is null or profile_id = auth.uid())
);

drop policy if exists "reservations_select_own" on reservations;
create policy "reservations_select_own"
on reservations
for select
to authenticated
using (profile_id = auth.uid());

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
-- insert into profiles (id, email, role, membership_status)
-- values ('AUTH_USER_UUID', 'colorfg@gmail.com', 'admin', 'approved')
-- on conflict (id) do update set role = 'admin', email = excluded.email, membership_status = 'approved';
