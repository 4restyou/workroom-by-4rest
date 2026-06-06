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

update profiles
set membership_status = 'approved'
where membership_status = 'pending';

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
  seat_type_id uuid,
  is_active boolean default true,
  sort_order integer default 0,
  created_at timestamp with time zone default now()
);

create table if not exists seat_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  capacity integer not null default 1 check (capacity >= 0),
  is_active boolean default true,
  sort_order integer default 0,
  created_at timestamp with time zone default now()
);

alter table passes add column if not exists seat_type_id uuid references seat_types(id) on delete set null;

create table if not exists business_hours (
  id uuid primary key default gen_random_uuid(),
  weekday integer not null unique check (weekday between 0 and 6),
  open_time time not null default '09:00',
  close_time time not null default '21:00',
  is_closed boolean default false
);

create table if not exists space_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamp with time zone default now()
);

create table if not exists reservation_notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  reservation_id uuid references reservations(id) on delete cascade,
  type text not null default 'reservation',
  title text not null,
  body text not null,
  is_read boolean default false,
  created_at timestamp with time zone default now()
);

alter table reservations add column if not exists pass_id uuid references passes(id) on delete set null;
alter table reservations add column if not exists pass_name_snapshot text;
alter table reservations add column if not exists price_at_booking integer;
alter table reservations add column if not exists seat_type_id uuid references seat_types(id) on delete set null;
alter table reservations add column if not exists notified_at timestamp with time zone;

alter table profiles enable row level security;
alter table reservations enable row level security;
alter table passes enable row level security;
alter table seat_types enable row level security;
alter table business_hours enable row level security;
alter table space_settings enable row level security;
alter table reservation_notifications enable row level security;

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

create or replace function public.check_reservation_capacity(
  p_date date,
  p_start_time time,
  p_end_time time,
  p_seat_type_id uuid,
  p_people integer default 1
)
returns table (
  available boolean,
  capacity integer,
  booked integer,
  remaining integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  seat_capacity integer;
  booked_people integer;
begin
  if p_seat_type_id is null then
    return query select true, null::integer, 0, null::integer;
    return;
  end if;

  select st.capacity
  into seat_capacity
  from public.seat_types st
  where st.id = p_seat_type_id
    and st.is_active = true;

  if seat_capacity is null then
    return query select false, 0, 0, 0;
    return;
  end if;

  select coalesce(sum(coalesce(r.people, 1)), 0)
  into booked_people
  from public.reservations r
  where r.date = p_date
    and r.seat_type_id = p_seat_type_id
    and r.status in ('pending', 'confirmed')
    and r.start_time is not null
    and r.end_time is not null
    and r.start_time < p_end_time
    and r.end_time > p_start_time;

  return query
  select
    booked_people + greatest(coalesce(p_people, 1), 1) <= seat_capacity,
    seat_capacity,
    booked_people,
    greatest(seat_capacity - booked_people, 0);
end;
$$;

create or replace function public.notify_reservation_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.profile_id is not null and old.status is distinct from new.status then
    insert into public.reservation_notifications (profile_id, reservation_id, type, title, body)
    values (
      new.profile_id,
      new.id,
      'reservation_status',
      case new.status
        when 'confirmed' then '예약이 확정되었습니다.'
        when 'canceled' then '예약이 취소되었습니다.'
        when 'completed' then '이용이 완료되었습니다.'
        else '예약 상태가 변경되었습니다.'
      end,
      coalesce(new.pass_name_snapshot, new.pass_type) || ' / ' || new.date::text || ' ' || coalesce(left(new.start_time::text, 5), '') || '-' || coalesce(left(new.end_time::text, 5), '')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists reservation_status_notification on reservations;
create trigger reservation_status_notification
after update of status on reservations
for each row execute function public.notify_reservation_status_change();

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

drop policy if exists "seat_types_public_read_active" on seat_types;
create policy "seat_types_public_read_active"
on seat_types
for select
to anon, authenticated
using (is_active = true or public.is_admin());

drop policy if exists "seat_types_admin_all" on seat_types;
create policy "seat_types_admin_all"
on seat_types
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "business_hours_public_read" on business_hours;
create policy "business_hours_public_read"
on business_hours
for select
to anon, authenticated
using (true);

drop policy if exists "business_hours_admin_all" on business_hours;
create policy "business_hours_admin_all"
on business_hours
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "space_settings_public_read" on space_settings;
create policy "space_settings_public_read"
on space_settings
for select
to anon, authenticated
using (true);

drop policy if exists "space_settings_admin_all" on space_settings;
create policy "space_settings_admin_all"
on space_settings
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

drop policy if exists "reservation_notifications_select_own_or_admin" on reservation_notifications;
create policy "reservation_notifications_select_own_or_admin"
on reservation_notifications
for select
to authenticated
using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "reservation_notifications_update_own" on reservation_notifications;
create policy "reservation_notifications_update_own"
on reservation_notifications
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

drop policy if exists "reservation_notifications_admin_all" on reservation_notifications;
create policy "reservation_notifications_admin_all"
on reservation_notifications
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into seat_types (name, capacity, sort_order)
values
  ('단독석', 5, 1),
  ('다인석', 5, 2),
  ('공용석', 10, 3)
on conflict (name) do nothing;

insert into business_hours (weekday, open_time, close_time, is_closed)
values
  (0, '10:00', '18:00', true),
  (1, '09:00', '21:00', false),
  (2, '09:00', '21:00', false),
  (3, '09:00', '21:00', false),
  (4, '09:00', '21:00', false),
  (5, '09:00', '21:00', false),
  (6, '10:00', '18:00', false)
on conflict (weekday) do nothing;

insert into space_settings (key, value)
values
  ('reservation_notice', '예약 신청 후 확정되면 연락드립니다.'),
  ('payment_notice', '결제는 예약 확정 안내 후 진행됩니다.'),
  ('location_notice', '광주광역시 동구 충장로 / 금남로5가역 도보 약 3-5분'),
  ('reservation_enabled', 'true')
on conflict (key) do nothing;

insert into passes (name, description, price, sort_order)
select pass_seed.name, pass_seed.description, pass_seed.price, pass_seed.sort_order
from (
  values
    ('1시간권', '1시간 이용', 4000, 1),
    ('종일권 라이트', '평일 09:00-18:00', 30000, 2),
    ('종일권 스탠다드', '평일 09:00-21:00', 40000, 3),
    ('주간권 라이트', '월-금 09:00-18:00', 99000, 4),
    ('주간권 스탠다드', '월-금 09:00-21:00', 139000, 5),
    ('월권 자유석', '4주 기준 / 비지정석', 199000, 6),
    ('월권 지정석', '4주 기준 / 지정석', 299000, 7)
) as pass_seed(name, description, price, sort_order)
where not exists (
  select 1
  from passes
  where passes.name = pass_seed.name
);

update passes
set seat_type_id = (select id from seat_types where name = '공용석')
where seat_type_id is null;

-- 관리자 계정 생성 후 auth.users의 id를 확인해 아래 예시처럼 등록합니다.
-- insert into profiles (id, email, role, membership_status)
-- values ('AUTH_USER_UUID', 'colorfg@gmail.com', 'admin', 'approved')
-- on conflict (id) do update set role = 'admin', email = excluded.email, membership_status = 'approved';
