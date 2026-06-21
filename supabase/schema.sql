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
alter table profiles add column if not exists consented_at timestamp with time zone;
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
  people integer default 1 check (people between 1 and 12),
  message text,
  status text default 'pending' check (status in ('pending', 'confirmed', 'canceled', 'completed', 'no_show')),
  payment_method text,
  payment_status text default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded')),
  admin_note text,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  constraint reservations_name_not_blank check (btrim(name) <> ''),
  constraint reservations_phone_not_blank check (btrim(phone) <> ''),
  constraint reservations_pass_type_not_blank check (btrim(pass_type) <> ''),
  constraint reservations_time_order check (
    start_time is null
    or end_time is null
    or start_time < end_time
  )
);

alter table reservations add column if not exists profile_id uuid references profiles(id) on delete set null;
alter table reservations add column if not exists payment_method text;
alter table reservations add column if not exists payment_status text default 'unpaid';
alter table reservations add column if not exists deleted_at timestamp with time zone;
alter table reservations alter column payment_status set default 'unpaid';
update reservations set payment_status = 'unpaid' where payment_status is null;

alter table reservations drop constraint if exists reservations_status_check;
alter table reservations
add constraint reservations_status_check
check (status in ('pending', 'confirmed', 'canceled', 'completed', 'no_show'));

alter table reservations drop constraint if exists reservations_payment_status_check;
alter table reservations
add constraint reservations_payment_status_check
check (payment_status in ('unpaid', 'paid', 'refunded'));

update reservations set people = 1 where people is null or people < 1;
update reservations set people = 12 where people > 12;

alter table reservations drop constraint if exists reservations_people_range;
alter table reservations
add constraint reservations_people_range
check (people between 1 and 12);

alter table reservations drop constraint if exists reservations_name_not_blank;
alter table reservations
add constraint reservations_name_not_blank
check (btrim(name) <> '');

alter table reservations drop constraint if exists reservations_phone_not_blank;
alter table reservations
add constraint reservations_phone_not_blank
check (btrim(phone) <> '');

alter table reservations drop constraint if exists reservations_pass_type_not_blank;
alter table reservations
add constraint reservations_pass_type_not_blank
check (btrim(pass_type) <> '');

alter table reservations drop constraint if exists reservations_time_order;
alter table reservations
add constraint reservations_time_order
check (
  start_time is null
  or end_time is null
  or start_time < end_time
);

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
alter table reservations add column if not exists payment_key text;

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
  if auth.role() = 'service_role' or auth.uid() is null or public.is_admin() then
    return new;
  end if;

  new.role = old.role;
  new.membership_status = old.membership_status;
  return new;
end;
$$;

create or replace function public.prevent_member_privilege_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or auth.uid() is null or public.is_admin() then
    return new;
  end if;

  new.role := 'user';
  new.membership_status := 'approved';
  return new;
end;
$$;

drop trigger if exists prevent_member_privilege_insert on profiles;
create trigger prevent_member_privilege_insert
before insert on profiles
for each row execute function public.prevent_member_privilege_insert();

drop trigger if exists prevent_member_privilege_update on profiles;
create trigger prevent_member_privilege_update
before update on profiles
for each row execute function public.prevent_member_privilege_update();

drop function if exists public.update_my_profile(text, text, text);
create or replace function public.update_my_profile(
  p_full_name text,
  p_phone text,
  p_address text,
  p_consent boolean default false
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
    address = nullif(trim(p_address), ''),
    consented_at = case when p_consent and consented_at is null then now() else consented_at end
  where id = auth.uid()
  returning * into updated_profile;

  if updated_profile.id is null then
    insert into public.profiles (id, email, full_name, phone, address, consented_at)
    values (
      auth.uid(),
      coalesce((auth.jwt() ->> 'email'), ''),
      nullif(trim(p_full_name), ''),
      nullif(trim(p_phone), ''),
      nullif(trim(p_address), ''),
      case when p_consent then now() else null end
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
        when 'no_show' then '예약이 노쇼 처리되었습니다.'
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

-- Server-side reservation guard. Runs on every insert so the rules cannot be
-- bypassed by a crafted client, and serializes the capacity check per
-- seat/day with an advisory lock so concurrent requests can't overbook.
create or replace function public.before_reservation_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled text;
  v_pass public.passes%rowtype;
  v_hours public.business_hours%rowtype;
  v_dow integer;
  v_capacity integer;
  v_booked integer;
  v_revalidate boolean;
begin
  -- 1) Only new requests are blocked when reservations are paused.
  if tg_op = 'INSERT' then
    select value into v_enabled from public.space_settings where key = 'reservation_enabled';
    if coalesce(v_enabled, 'true') <> 'true' then
      raise exception '현재 예약을 받고 있지 않습니다.';
    end if;
  end if;

  -- 2) Resolve the pass on the server so price / snapshot cannot be spoofed.
  if new.pass_type is distinct from '기타 문의' then
    select * into v_pass
    from public.passes
    where name = new.pass_type and is_active = true
    order by sort_order
    limit 1;

    if found then
      new.pass_id := v_pass.id;
      new.pass_name_snapshot := v_pass.name;
      new.price_at_booking := v_pass.price;
      new.seat_type_id := v_pass.seat_type_id;
    end if;
  end if;

  -- Re-validate hours + capacity on insert, or when the time window changed.
  if tg_op = 'INSERT' then
    v_revalidate := true;
  else
    v_revalidate := new.date is distinct from old.date
      or new.start_time is distinct from old.start_time
      or new.end_time is distinct from old.end_time
      or new.seat_type_id is distinct from old.seat_type_id
      or coalesce(new.people, 1) is distinct from coalesce(old.people, 1);
  end if;

  if v_revalidate and new.start_time is not null and new.end_time is not null then
    if new.end_time <= new.start_time then
      raise exception '종료 시간은 시작 시간보다 늦어야 합니다.';
    end if;

    v_dow := extract(dow from new.date);  -- 0 = Sunday .. 6 = Saturday
    select * into v_hours from public.business_hours where weekday = v_dow;
    if found then
      if v_hours.is_closed then
        raise exception '선택하신 날짜는 휴무일입니다.';
      end if;
      if new.start_time < v_hours.open_time or new.end_time > v_hours.close_time then
        raise exception '운영 시간(% - %) 안에서만 예약할 수 있습니다.',
          to_char(v_hours.open_time, 'HH24:MI'), to_char(v_hours.close_time, 'HH24:MI');
      end if;
    end if;

    if new.seat_type_id is not null and new.status in ('pending', 'confirmed') then
      -- Serialize capacity checks for the same seat type + date.
      perform pg_advisory_xact_lock(hashtext(new.seat_type_id::text || new.date::text));

      select capacity into v_capacity
      from public.seat_types
      where id = new.seat_type_id and is_active = true;

      if v_capacity is null then
        raise exception '선택하신 좌석을 사용할 수 없습니다.';
      end if;

      select coalesce(sum(coalesce(people, 1)), 0) into v_booked
      from public.reservations
      where date = new.date
        and seat_type_id = new.seat_type_id
        and status in ('pending', 'confirmed')
        and start_time is not null and end_time is not null
        and start_time < new.end_time and end_time > new.start_time
        and id is distinct from new.id;  -- exclude the row being updated

      if v_booked + greatest(coalesce(new.people, 1), 1) > v_capacity then
        raise exception '선택한 시간대의 잔여 좌석이 부족합니다. (잔여 %석)', greatest(v_capacity - v_booked, 0);
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists before_reservation_insert on reservations;
drop trigger if exists before_reservation_write on reservations;
create trigger before_reservation_write
before insert or update on reservations
for each row execute function public.before_reservation_write();

drop function if exists public.before_reservation_insert();

create or replace function public.guard_reservation_member_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_start_at timestamp with time zone;
  changes_schedule boolean;
begin
  -- Admins and trusted server functions may update operational/payment fields.
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  if auth.uid() is null or old.profile_id is distinct from auth.uid() then
    raise exception '본인 예약만 수정할 수 있습니다.';
  end if;

  if old.status not in ('pending', 'confirmed') then
    raise exception '대기 또는 확정 상태의 예약만 수정할 수 있습니다.';
  end if;

  old_start_at := (old.date + coalesce(old.start_time, time '00:00')) at time zone 'Asia/Seoul';
  changes_schedule := new.date is distinct from old.date
    or new.start_time is distinct from old.start_time
    or new.end_time is distinct from old.end_time;

  if (changes_schedule or new.status is distinct from old.status)
     and old_start_at <= now() then
    raise exception '예약 시작 시간이 지나 수정하거나 취소할 수 없습니다.';
  end if;

  -- Members may only re-request date/time changes or cancel. Everything else
  -- is restored so crafted API calls cannot touch admin/payment fields.
  new.profile_id := old.profile_id;
  new.name := old.name;
  new.phone := old.phone;
  new.email := old.email;
  new.pass_type := old.pass_type;
  new.people := old.people;
  new.message := old.message;
  new.pass_id := old.pass_id;
  new.pass_name_snapshot := old.pass_name_snapshot;
  new.price_at_booking := old.price_at_booking;
  new.seat_type_id := old.seat_type_id;
  new.payment_method := old.payment_method;
  new.payment_status := old.payment_status;
  new.payment_key := old.payment_key;
  new.admin_note := old.admin_note;
  new.notified_at := old.notified_at;
  new.deleted_at := old.deleted_at;
  new.created_at := old.created_at;

  return new;
end;
$$;

drop trigger if exists aa_guard_reservation_member_update on public.reservations;
create trigger aa_guard_reservation_member_update
before update on public.reservations
for each row execute function public.guard_reservation_member_update();

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
with check (
  id = auth.uid()
  and role = 'user'
  and membership_status = 'approved'
);

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

-- Reservations are members only: must be signed in and book for themselves.
drop policy if exists "reservations_public_insert" on reservations;
drop policy if exists "reservations_member_insert" on reservations;
create policy "reservations_member_insert"
on reservations
for insert
to authenticated
with check (
  status = 'pending'
  and name <> ''
  and phone <> ''
  and pass_type <> ''
  and coalesce(payment_status, 'unpaid') = 'unpaid'
  and payment_method is null
  and profile_id = auth.uid()
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

-- Members may cancel or re-request (edit) their own reservation, but cannot
-- self-confirm: the resulting status must be pending or canceled. (Price /
-- snapshot are re-filled by before_reservation_write so they can't be spoofed.)
drop policy if exists "reservations_owner_update" on reservations;
create policy "reservations_owner_update"
on reservations
for update
to authenticated
using (profile_id = auth.uid())
with check (
  profile_id = auth.uid()
  and status in ('pending', 'canceled')
);

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

-- Inquiries a member leaves on their own reservation; the admin reads them.
create table if not exists reservation_inquiries (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references reservations(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  body text not null,
  created_at timestamp with time zone default now()
);

alter table reservation_inquiries enable row level security;

drop policy if exists "reservation_inquiries_insert_own" on reservation_inquiries;
create policy "reservation_inquiries_insert_own"
on reservation_inquiries
for insert
to authenticated
with check (
  profile_id = auth.uid()
  and exists (
    select 1 from public.reservations r
    where r.id = reservation_id and r.profile_id = auth.uid()
  )
);

drop policy if exists "reservation_inquiries_select_own_or_admin" on reservation_inquiries;
create policy "reservation_inquiries_select_own_or_admin"
on reservation_inquiries
for select
to authenticated
using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "reservation_inquiries_admin_all" on reservation_inquiries;
create policy "reservation_inquiries_admin_all"
on reservation_inquiries
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

alter table reservation_inquiries add column if not exists admin_reply text;
alter table reservation_inquiries add column if not exists replied_at timestamp with time zone;
alter table reservation_inquiries add column if not exists edited_at timestamp with time zone;

-- Members may edit their own inquiry text. A trigger keeps non-admins from
-- touching the admin reply and stamps edited_at when the body changes.
drop policy if exists "reservation_inquiries_update_own" on reservation_inquiries;
create policy "reservation_inquiries_update_own"
on reservation_inquiries
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create or replace function public.guard_inquiry_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.admin_reply := old.admin_reply;
    new.replied_at := old.replied_at;
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_inquiry_update on reservation_inquiries;
create trigger guard_inquiry_update
before update on reservation_inquiries
for each row execute function public.guard_inquiry_update();

-- Notify every admin when a member leaves an inquiry.
create or replace function public.notify_inquiry_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.reservation_notifications (profile_id, reservation_id, type, title, body)
  select p.id, new.reservation_id, 'inquiry', '새 문의가 도착했습니다.', left(new.body, 120)
  from public.profiles p
  where p.role = 'admin';
  return new;
end;
$$;

drop trigger if exists on_inquiry_created on reservation_inquiries;
create trigger on_inquiry_created
after insert on reservation_inquiries
for each row execute function public.notify_inquiry_created();

-- Notify the member when the admin posts a reply.
create or replace function public.notify_inquiry_replied()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.admin_reply is not null and btrim(new.admin_reply) <> '' and new.admin_reply is distinct from old.admin_reply then
    if new.profile_id is not null then
      insert into public.reservation_notifications (profile_id, reservation_id, type, title, body)
      values (new.profile_id, new.reservation_id, 'inquiry_reply', '문의에 답변이 등록되었습니다.', left(new.admin_reply, 120));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_inquiry_replied on reservation_inquiries;
create trigger on_inquiry_replied
after update on reservation_inquiries
for each row execute function public.notify_inquiry_replied();

insert into seat_types (name, capacity, sort_order)
values
  ('단독석', 5, 1),
  ('다인석', 5, 2),
  ('공용석', 10, 3)
on conflict (name) do nothing;

insert into business_hours (weekday, open_time, close_time, is_closed)
values
  (0, '09:00', '22:00', false),
  (1, '09:00', '22:00', false),
  (2, '09:00', '22:00', false),
  (3, '09:00', '22:00', false),
  (4, '09:00', '22:00', false),
  (5, '09:00', '22:00', false),
  (6, '09:00', '22:00', false)
on conflict (weekday) do update
set open_time = excluded.open_time,
    close_time = excluded.close_time,
    is_closed = excluded.is_closed;

insert into space_settings (key, value)
values
  ('reservation_notice', '홈페이지 예약을 기준으로 운영합니다. 예약 신청 후 전화 또는 문자로 확인 안내를 드립니다.'),
  ('payment_notice', '예약 확인 후 온라인 결제를 선택한 분께 별도의 결제 링크를 보내드립니다. 링크 수신 후 2시간 이내 결제해 주세요. 현장 결제는 방문 시 진행할 수 있습니다.'),
  ('cancellation_notice', '3시간권과 종일권은 예약 시간 전까지 당일 취소가 가능합니다. 예약 시간이 지난 뒤에는 취소 및 환불이 어렵습니다.'),
  ('extension_notice', '이용 시간 종료 후 15분까지는 유예되며, 이후에는 1시간 추가 요금이 적용됩니다.'),
  ('etiquette_notice', '냄새가 적은 간단한 음식과 음료는 가능하며, 통화는 조용히 부탁드립니다. 음악과 영상은 이어폰 또는 헤드폰으로 이용해 주세요.'),
  ('print_notice', '흑백 프린트는 5장까지 무료이며, 초과 시 장당 100원입니다. 대량 출력은 사전 문의해 주세요.'),
  ('location_notice', '충장로 / 금남로5가역 도보 약 3-5분'),
  ('reservation_enabled', 'true')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

update passes
set is_active = false
where name in ('1시간권', '종일권 라이트', '종일권 스탠다드', '주간권 라이트', '주간권 스탠다드');

update passes set description = '기본 이용권 / 커피 1잔', price = 12000, sort_order = 1, is_active = true where name = '3시간권';
insert into passes (name, description, price, sort_order)
select '3시간권', '기본 이용권 / 커피 1잔', 12000, 1
where not exists (select 1 from passes where name = '3시간권');

update passes set description = '3시간 이후 좌석 여유 시 연장', price = 4000, sort_order = 2, is_active = true where name = '추가 1시간';
insert into passes (name, description, price, sort_order)
select '추가 1시간', '3시간 이후 좌석 여유 시 연장', 4000, 2
where not exists (select 1 from passes where name = '추가 1시간');

update passes set description = '09:00-22:00 / 커피 1일 3잔', price = 40000, sort_order = 3, is_active = true where name = '종일권';
insert into passes (name, description, price, sort_order)
select '종일권', '09:00-22:00 / 커피 1일 3잔', 40000, 3
where not exists (select 1 from passes where name = '종일권');

update passes set description = '월-금 09:00-22:00 / 커피 1일 3잔', price = 149000, sort_order = 4, is_active = true where name = '주간권';
insert into passes (name, description, price, sort_order)
select '주간권', '월-금 09:00-22:00 / 커피 1일 3잔', 149000, 4
where not exists (select 1 from passes where name = '주간권');

update passes set description = '4주 기준 / 비지정석 / 커피 1일 3잔', price = 199000, sort_order = 5, is_active = true where name = '월권 자유석';
insert into passes (name, description, price, sort_order)
select '월권 자유석', '4주 기준 / 비지정석 / 커피 1일 3잔', 199000, 5
where not exists (select 1 from passes where name = '월권 자유석');

update passes set description = '4주 기준 / 지정석 / 커피 1일 3잔', price = 299000, sort_order = 6, is_active = true where name = '월권 지정석';
insert into passes (name, description, price, sort_order)
select '월권 지정석', '4주 기준 / 지정석 / 커피 1일 3잔', 299000, 6
where not exists (select 1 from passes where name = '월권 지정석');

update passes
set seat_type_id = (select id from seat_types where name = '공용석')
where seat_type_id is null;

with ranked_passes as (
  select
    id,
    row_number() over (
      partition by name
      order by is_active desc, sort_order asc, created_at asc
    ) as row_number
  from public.passes
)
update public.passes
set is_active = false
where id in (
  select id
  from ranked_passes
  where row_number > 1
);

create unique index if not exists passes_active_name_unique
on public.passes (name)
where is_active = true;

create table if not exists public.reservation_audit_logs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null default 'updated',
  before_status text,
  after_status text,
  before_payment_status text,
  after_payment_status text,
  before_admin_note text,
  after_admin_note text,
  created_at timestamp with time zone default now()
);

alter table public.reservation_audit_logs enable row level security;

drop policy if exists "reservation_audit_logs_admin_select" on public.reservation_audit_logs;
create policy "reservation_audit_logs_admin_select"
on public.reservation_audit_logs
for select
to authenticated
using (public.is_admin());

grant select on public.reservation_audit_logs to authenticated;

create or replace function public.log_reservation_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_action text := 'updated';
begin
  if old.status is not distinct from new.status
     and old.payment_status is not distinct from new.payment_status
     and old.admin_note is not distinct from new.admin_note
     and old.deleted_at is not distinct from new.deleted_at then
    return new;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    next_action := 'archived';
  end if;

  insert into public.reservation_audit_logs (
    reservation_id,
    actor_id,
    action,
    before_status,
    after_status,
    before_payment_status,
    after_payment_status,
    before_admin_note,
    after_admin_note
  )
  values (
    new.id,
    auth.uid(),
    next_action,
    old.status,
    new.status,
    old.payment_status,
    new.payment_status,
    old.admin_note,
    new.admin_note
  );

  return new;
end;
$$;

drop trigger if exists on_reservation_audit_update on public.reservations;
create trigger on_reservation_audit_update
after update of status, payment_status, admin_note, deleted_at on public.reservations
for each row execute function public.log_reservation_update();

create table if not exists public.reservation_payment_logs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('confirm', 'refund')),
  status text not null check (status in ('requested', 'succeeded', 'failed', 'skipped')),
  amount integer,
  provider text not null default 'toss',
  provider_code text,
  message text,
  created_at timestamp with time zone default now()
);

create index if not exists reservation_payment_logs_reservation_created_idx
on public.reservation_payment_logs (reservation_id, created_at desc);

alter table public.reservation_payment_logs enable row level security;

drop policy if exists "reservation_payment_logs_admin_select" on public.reservation_payment_logs;
create policy "reservation_payment_logs_admin_select"
on public.reservation_payment_logs
for select
to authenticated
using (public.is_admin());

grant select on public.reservation_payment_logs to authenticated;

-- 관리자 계정 생성 후 auth.users의 id를 확인해 아래 예시처럼 등록합니다.
-- insert into profiles (id, email, role, membership_status)
-- values ('AUTH_USER_UUID', 'colorfg@gmail.com', 'admin', 'approved')
-- on conflict (id) do update set role = 'admin', email = excluded.email, membership_status = 'approved';
