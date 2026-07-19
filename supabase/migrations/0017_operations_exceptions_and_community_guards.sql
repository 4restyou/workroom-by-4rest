-- Date-specific opening hours and stricter member-generated content boundaries.

create table if not exists public.business_date_exceptions (
  date date primary key,
  open_time time not null default '09:00',
  close_time time not null default '22:00',
  is_closed boolean not null default false,
  note text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (is_closed or close_time > open_time)
);

alter table public.business_date_exceptions enable row level security;

drop policy if exists "business_date_exceptions_public_read" on public.business_date_exceptions;
create policy "business_date_exceptions_public_read"
on public.business_date_exceptions for select to anon, authenticated using (true);

drop policy if exists "business_date_exceptions_admin_all" on public.business_date_exceptions;
create policy "business_date_exceptions_admin_all"
on public.business_date_exceptions for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select on public.business_date_exceptions to anon, authenticated;
grant insert, update, delete on public.business_date_exceptions to authenticated;

create or replace function public.validate_reservation_date_exception()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exception public.business_date_exceptions%rowtype;
  v_revalidate boolean;
begin
  v_revalidate := tg_op = 'INSERT'
    or new.date is distinct from old.date
    or new.start_time is distinct from old.start_time
    or new.end_time is distinct from old.end_time;

  if not v_revalidate or new.start_time is null or new.end_time is null then
    return new;
  end if;

  select * into v_exception
  from public.business_date_exceptions
  where date = new.date;

  if found then
    if v_exception.is_closed then
      raise exception '선택하신 날짜는 휴무일입니다.%',
        case when nullif(v_exception.note, '') is null then '' else ' ' || v_exception.note end;
    end if;
    if new.start_time < v_exception.open_time or new.end_time > v_exception.close_time then
      raise exception '해당 날짜의 운영 시간(% - %) 안에서만 예약할 수 있습니다.',
        to_char(v_exception.open_time, 'HH24:MI'), to_char(v_exception.close_time, 'HH24:MI');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists aa_reservation_date_exception on public.reservations;
create trigger aa_reservation_date_exception
before insert or update on public.reservations
for each row execute function public.validate_reservation_date_exception();

-- The regular reservation guard must also prefer a date exception over the
-- weekday schedule. Administrators may still record phone/walk-in bookings
-- while public reservations are paused.
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
  v_exception public.business_date_exceptions%rowtype;
  v_dow integer;
  v_capacity integer;
  v_booked integer;
  v_revalidate boolean;
begin
  if tg_op = 'INSERT' and not public.is_admin() then
    select value into v_enabled from public.space_settings where key = 'reservation_enabled';
    if coalesce(v_enabled, 'true') <> 'true' then
      raise exception '현재 예약을 받고 있지 않습니다.';
    end if;
  end if;

  if new.pass_type is distinct from '기타 문의' then
    select * into v_pass from public.passes
    where name = new.pass_type and is_active = true
    order by sort_order limit 1;
    if found then
      new.pass_id := v_pass.id;
      new.pass_name_snapshot := v_pass.name;
      new.price_at_booking := v_pass.price;
      new.seat_type_id := v_pass.seat_type_id;
    end if;
  end if;

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

    select * into v_exception from public.business_date_exceptions where date = new.date;
    if found then
      if v_exception.is_closed then
        raise exception '선택하신 날짜는 휴무일입니다.%',
          case when nullif(v_exception.note, '') is null then '' else ' ' || v_exception.note end;
      end if;
      if new.start_time < v_exception.open_time or new.end_time > v_exception.close_time then
        raise exception '해당 날짜의 운영 시간(% - %) 안에서만 예약할 수 있습니다.',
          to_char(v_exception.open_time, 'HH24:MI'), to_char(v_exception.close_time, 'HH24:MI');
      end if;
    else
      v_dow := extract(dow from new.date);
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
    end if;

    if new.seat_type_id is not null and new.status in ('pending', 'confirmed') then
      perform pg_advisory_xact_lock(hashtext(new.seat_type_id::text || new.date::text));
      select capacity into v_capacity from public.seat_types where id = new.seat_type_id and is_active = true;
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
        and id is distinct from new.id;
      if v_booked + greatest(coalesce(new.people, 1), 1) > v_capacity then
        raise exception '선택한 시간대의 잔여 좌석이 부족합니다. (잔여 %석)', greatest(v_capacity - v_booked, 0);
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.guard_board_post_member_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select coalesce(nullif(full_name, ''), '회원') into v_name
    from public.profiles where id = auth.uid();
    new.profile_id := auth.uid();
    new.author_name := coalesce(v_name, '회원');
    new.kind := 'message';
    new.is_pinned := false;
    new.is_hidden := false;
  else
    new.profile_id := old.profile_id;
    new.author_name := old.author_name;
    new.kind := old.kind;
    new.is_pinned := old.is_pinned;
    new.is_hidden := old.is_hidden;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_board_post_member_write on public.board_posts;
create trigger guard_board_post_member_write
before insert or update on public.board_posts
for each row execute function public.guard_board_post_member_write();

create or replace function public.guard_member_card_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    new.profile_id := case when tg_op = 'INSERT' then auth.uid() else old.profile_id end;
  end if;

  if nullif(trim(new.link_url), '') is not null and trim(new.link_url) !~* '^https?://[^[:space:]]+$' then
    raise exception '홈페이지 주소는 http:// 또는 https://로 시작해야 합니다.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_member_card_write on public.member_cards;
create trigger guard_member_card_write
before insert or update on public.member_cards
for each row execute function public.guard_member_card_write();
