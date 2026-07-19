-- Member-facing live reservation status, long-term access periods, and
-- idempotent end-of-use reminders.

alter table public.reservations
  add column if not exists access_start_date date,
  add column if not exists access_end_date date,
  add column if not exists access_weekdays smallint[],
  add column if not exists access_paused_from date,
  add column if not exists access_paused_until date,
  add column if not exists end_reminder_attempted_at timestamp with time zone,
  add column if not exists end_reminder_sent_at timestamp with time zone;

alter table public.reservations drop constraint if exists reservations_access_period_check;
alter table public.reservations
  add constraint reservations_access_period_check
  check (
    (access_start_date is null and access_end_date is null)
    or (access_start_date is not null and access_end_date is not null and access_end_date >= access_start_date)
  );

alter table public.reservations drop constraint if exists reservations_access_pause_check;
alter table public.reservations
  add constraint reservations_access_pause_check
  check (
    (access_paused_from is null and access_paused_until is null)
    or (access_paused_from is not null and access_paused_until is not null and access_paused_until >= access_paused_from)
  );

alter table public.reservations drop constraint if exists reservations_access_weekdays_check;
alter table public.reservations
  add constraint reservations_access_weekdays_check
  check (
    access_weekdays is null
    or (
      cardinality(access_weekdays) > 0
      and access_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
    )
  );

alter table public.reservations disable trigger aa_guard_reservation_member_update;

update public.reservations
set
  access_start_date = date,
  access_end_date = date + 6,
  access_weekdays = array[1,2,3,4,5]::smallint[]
where coalesce(pass_name_snapshot, pass_type) ilike '%주간권%'
  and access_start_date is null;

update public.reservations
set
  access_start_date = date,
  access_end_date = date + 27,
  access_weekdays = array[0,1,2,3,4,5,6]::smallint[]
where coalesce(pass_name_snapshot, pass_type) ilike '%월권%'
  and access_start_date is null;

alter table public.reservations enable trigger aa_guard_reservation_member_update;

create or replace function public.set_reservation_access_period()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce(new.pass_name_snapshot, new.pass_type, '');
  v_duration integer;
begin
  if v_name ilike '%주간권%' or v_name ilike '%월권%' then
    if tg_op = 'INSERT' or new.access_start_date is null or new.access_end_date is null then
      new.access_start_date := new.date;
      if v_name ilike '%주간권%' then
        new.access_end_date := new.date + 6;
        new.access_weekdays := array[1,2,3,4,5]::smallint[];
      else
        new.access_end_date := new.date + 27;
        new.access_weekdays := array[0,1,2,3,4,5,6]::smallint[];
      end if;
    elsif tg_op = 'UPDATE'
      and new.date is distinct from old.date
      and new.access_start_date is not distinct from old.access_start_date
      and old.access_start_date is not null
      and old.access_end_date is not null then
      v_duration := old.access_end_date - old.access_start_date;
      new.access_start_date := new.date;
      new.access_end_date := new.date + v_duration;
    end if;
  else
    new.access_start_date := null;
    new.access_end_date := null;
    new.access_weekdays := null;
    new.access_paused_from := null;
    new.access_paused_until := null;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_set_reservation_access_period on public.reservations;
create trigger zz_set_reservation_access_period
before insert or update of date, pass_type, pass_name_snapshot, access_start_date, access_end_date
on public.reservations
for each row execute function public.set_reservation_access_period();

create or replace function public.guard_reservation_access_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    new.access_start_date := old.access_start_date;
    new.access_end_date := old.access_end_date;
    new.access_weekdays := old.access_weekdays;
    new.access_paused_from := old.access_paused_from;
    new.access_paused_until := old.access_paused_until;
    new.end_reminder_attempted_at := old.end_reminder_attempted_at;
    new.end_reminder_sent_at := old.end_reminder_sent_at;
  end if;
  return new;
end;
$$;

drop trigger if exists ac_guard_reservation_access_fields on public.reservations;
create trigger ac_guard_reservation_access_fields
before update on public.reservations
for each row execute function public.guard_reservation_access_fields();

create or replace function public.reset_reservation_end_reminder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.date is distinct from old.date
    or new.end_time is distinct from old.end_time
    or (new.status = 'confirmed' and old.status is distinct from 'confirmed') then
    new.end_reminder_attempted_at := null;
    new.end_reminder_sent_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists zy_reset_reservation_end_reminder on public.reservations;
create trigger zy_reset_reservation_end_reminder
before update of date, end_time, status on public.reservations
for each row execute function public.reset_reservation_end_reminder();

-- Claims each reminder once before the external SMS request. Only checked-in,
-- non-long-term reservations ending within twenty minutes are returned.
create or replace function public.claim_reservation_end_reminders()
returns table (
  reservation_id uuid,
  member_name text,
  phone text,
  reservation_date date,
  end_time time,
  pass_name text
)
language sql
security definer
set search_path = public
as $$
  update public.reservations r
  set end_reminder_attempted_at = now()
  from (
    select r2.id
    from public.reservations r2
    where r2.status = 'confirmed'
      and r2.deleted_at is null
      and r2.access_start_date is null
      and r2.date = (now() at time zone 'Asia/Seoul')::date
      and r2.end_time is not null
      and r2.end_reminder_attempted_at is null
      and ((r2.date + r2.end_time) at time zone 'Asia/Seoul') > now()
      and ((r2.date + r2.end_time) at time zone 'Asia/Seoul') <= now() + interval '20 minutes'
      and exists (
        select 1 from public.attendance a
        where a.reservation_id = r2.id
          and a.check_out_at is null
          and (a.check_in_at at time zone 'Asia/Seoul')::date = r2.date
      )
    for update skip locked
  ) candidate
  where r.id = candidate.id
  returning
    r.id,
    r.name,
    r.phone,
    r.date,
    r.end_time,
    coalesce(r.pass_name_snapshot, r.pass_type);
$$;

revoke all on function public.claim_reservation_end_reminders() from public, anon, authenticated;
grant execute on function public.claim_reservation_end_reminders() to service_role;

-- Long-term passes can check in on each eligible day of their access period.
create or replace function public.attendance_check_in(
  p_token text,
  p_lat double precision default null,
  p_lng double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
  v_goal int;
  v_reward text;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_now timestamptz := now();
  v_res uuid;
  v_existing uuid;
  v_count int;
  v_coupon boolean := false;
  v_has_res boolean;
  v_lat text;
  v_lng text;
  v_radius text;
  v_dist double precision;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH', 'message', '로그인이 필요합니다.');
  end if;

  select value into v_token from public.space_settings where key = 'attendance_qr_token';
  if v_token is null or p_token is distinct from v_token then
    return jsonb_build_object('ok', false, 'code', 'TOKEN', 'message', '유효하지 않은 QR입니다.');
  end if;

  select exists (
    select 1 from public.reservations r
    where r.profile_id = v_uid
      and r.status = 'confirmed'
      and r.deleted_at is null
      and (
        (r.access_start_date is null and r.date = v_today)
        or (
          r.access_start_date is not null
          and v_today between r.access_start_date and r.access_end_date
          and extract(dow from v_today)::smallint = any(r.access_weekdays)
          and not (
            r.access_paused_from is not null
            and v_today between r.access_paused_from and r.access_paused_until
          )
          and not exists (
            select 1 from public.business_date_exceptions e
            where e.date = v_today and e.is_closed
          )
          and (
            exists (
              select 1 from public.business_date_exceptions e
              where e.date = v_today and not e.is_closed
            )
            or not coalesce((
              select h.is_closed from public.business_hours h
              where h.weekday = extract(dow from v_today)::integer
            ), false)
          )
        )
      )
  ) into v_has_res;
  if not v_has_res then
    return jsonb_build_object('ok', false, 'code', 'NO_RESERVATION', 'message', '오늘 이용 가능한 확정 예약이 없어요.');
  end if;

  select r.id into v_res
  from public.reservations r
  where r.profile_id = v_uid
    and r.status = 'confirmed'
    and r.deleted_at is null
    and (
      (r.access_start_date is null and r.date = v_today)
      or (
        r.access_start_date is not null
        and v_today between r.access_start_date and r.access_end_date
        and extract(dow from v_today)::smallint = any(r.access_weekdays)
        and not (
          r.access_paused_from is not null
          and v_today between r.access_paused_from and r.access_paused_until
        )
        and not exists (
          select 1 from public.business_date_exceptions e
          where e.date = v_today and e.is_closed
        )
        and (
          exists (
            select 1 from public.business_date_exceptions e
            where e.date = v_today and not e.is_closed
          )
          or not coalesce((
            select h.is_closed from public.business_hours h
            where h.weekday = extract(dow from v_today)::integer
          ), false)
        )
      )
    )
    and v_now >= ((v_today + coalesce(r.start_time, time '00:00')) at time zone 'Asia/Seoul') - interval '30 min'
    and v_now <= ((v_today + coalesce(r.end_time, time '23:59')) at time zone 'Asia/Seoul')
  order by r.start_time nulls last
  limit 1;
  if v_res is null then
    return jsonb_build_object('ok', false, 'code', 'TIME', 'message', '지금은 이용 시간이 아니에요.');
  end if;

  select value into v_lat from public.space_settings where key = 'attendance_lat';
  select value into v_lng from public.space_settings where key = 'attendance_lng';
  select value into v_radius from public.space_settings where key = 'attendance_radius_m';
  if v_lat is not null and v_lat <> '' and v_lng is not null and v_lng <> '' then
    if p_lat is null or p_lng is null then
      return jsonb_build_object('ok', false, 'code', 'LOCATION', 'message', '위치 확인이 필요해요. 위치 권한을 허용해 주세요.');
    end if;
    v_dist := 6371000 * acos(least(1, greatest(-1,
      sin(radians(p_lat)) * sin(radians(v_lat::double precision)) +
      cos(radians(p_lat)) * cos(radians(v_lat::double precision)) * cos(radians(v_lng::double precision - p_lng))
    )));
    if v_dist > coalesce(nullif(v_radius, '')::double precision, 150) then
      return jsonb_build_object('ok', false, 'code', 'LOCATION', 'message', '매장 근처에서만 출근할 수 있어요.');
    end if;
  end if;

  select id into v_existing
  from public.attendance
  where profile_id = v_uid and (check_in_at at time zone 'Asia/Seoul')::date = v_today
  limit 1;
  if v_existing is not null then
    select count(*) into v_count from public.attendance where profile_id = v_uid;
    return jsonb_build_object('ok', true, 'already', true, 'stamps', v_count, 'message', '오늘은 이미 출근했어요.');
  end if;

  insert into public.attendance (profile_id, reservation_id) values (v_uid, v_res);

  select count(*) into v_count from public.attendance where profile_id = v_uid;
  select coalesce(nullif(value, '')::int, 10) into v_goal from public.space_settings where key = 'attendance_stamp_goal';
  if v_goal is null or v_goal < 1 then v_goal := 10; end if;

  if v_count > 0 and v_count % v_goal = 0 then
    select value into v_reward from public.space_settings where key = 'attendance_reward_label';
    insert into public.coupons (profile_id, label) values (v_uid, coalesce(nullif(v_reward, ''), '보상'));
    v_coupon := true;
  end if;

  return jsonb_build_object('ok', true, 'already', false, 'stamps', v_count, 'goal', v_goal, 'coupon', v_coupon);
end;
$$;

grant execute on function public.attendance_check_in(text, double precision, double precision) to authenticated;
