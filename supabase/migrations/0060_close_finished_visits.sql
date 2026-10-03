-- 이용이 끝나면 자동으로 닫는다.
--
-- '이용 중'은 입실 기록이 있고 퇴실 기록이 없는 상태다. 퇴실을 찍는 사람이
-- 거의 없어서, 예약 시간이 한참 지난 뒤에도 입퇴실 화면과 오늘 타임라인에
-- 계속 '이용 중'으로 남았다. 현재 인원도 그만큼 부풀어 보인다.
--
-- 이용 시간이 끝난 기록을 닫는다.
--   단건 예약  — 그 예약의 종료 시각으로 닫는다.
--   월권·워크인 — 그날 마감 시각으로 닫는다(그 사람의 종료 시각이 따로 없다).
--
-- 입실 기록이 있고 시간이 끝난 단건 예약은 '이용 완료'로 바꾼다. 입실 기록이
-- 없는 예약은 건드리지 않는다 — 안 온 것인지 입실만 안 찍은 것인지는 사람이
-- 판단할 일이고, 대시보드가 이미 '미입실'로 띄운다.

create or replace function public.close_finished_visits()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_closed_booked integer := 0;
  v_closed_open integer := 0;
  v_completed integer := 0;
begin
  -- auth.role()은 SQL 편집기에서 null이다. null을 그대로 쓰면 조건 전체가 null이
  -- 되어 검사가 통과해 버리므로 빈 문자열로 받아 둔다.
  if not coalesce(public.is_admin(), false) and coalesce(auth.role(), '') <> 'service_role' then
    raise exception '권한이 없습니다.';
  end if;

  -- 예약을 수정하면 '본인 예약만 수정할 수 있습니다'(guard_reservation_member_update)에
  -- 걸린다. 그 트리거는 auth.role()을 보는데, 크론이 아니라 SQL 편집기나 관리자
  -- 화면에서 부르면 그 값이 없다. 호출 권한은 위에서 이미 확인했으므로, 이
  -- 트랜잭션 동안만 service_role로 선언하고 진행한다.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- 1) 예약 시간이 정해진 입실: 그 예약의 종료 시각으로 닫는다.
  with finished as (
    select a.id as attendance_id,
           (
             (r.date + r.end_time)
             + case when r.end_time <= r.start_time then interval '1 day' else interval '0' end
           ) at time zone 'Asia/Seoul' as ends_at
    from public.attendance a
    join public.reservations r on r.id = a.reservation_id
    where a.check_out_at is null
      and r.access_start_date is null
      and r.start_time is not null
      and r.end_time is not null
  )
  update public.attendance a
  set check_out_at = f.ends_at
  from finished f
  where a.id = f.attendance_id
    and f.ends_at < v_now;
  get diagnostics v_closed_booked = row_count;

  -- 2) 종료 시각이 따로 없는 입실(월권·주간권·워크인): 그날 마감 시각으로 닫는다.
  with open_rows as (
    select a.id, (a.check_in_at at time zone 'Asia/Seoul')::date as visit_date
    from public.attendance a
    left join public.reservations r on r.id = a.reservation_id
    where a.check_out_at is null
      and (r.id is null or r.access_start_date is not null or r.end_time is null or r.start_time is null)
  ),
  with_hours as (
    select o.id,
           o.visit_date,
           coalesce(
             (select e.open_time from public.business_date_exceptions e where e.date = o.visit_date and not e.is_closed),
             (select h.open_time from public.business_hours h where h.weekday = extract(dow from o.visit_date)::int),
             '08:00'::time
           ) as open_time,
           coalesce(
             (select e.close_time from public.business_date_exceptions e where e.date = o.visit_date and not e.is_closed),
             (select h.close_time from public.business_hours h where h.weekday = extract(dow from o.visit_date)::int),
             '01:00'::time
           ) as close_time
    from open_rows o
  ),
  closes as (
    select w.id,
           (
             (w.visit_date + w.close_time)
             + case when w.close_time <= w.open_time then interval '1 day' else interval '0' end
           ) at time zone 'Asia/Seoul' as closes_at
    from with_hours w
  )
  update public.attendance a
  set check_out_at = c.closes_at
  from closes c
  where a.id = c.id
    and c.closes_at < v_now;
  get diagnostics v_closed_open = row_count;

  -- 3) 다녀간 기록이 있고 시간이 끝난 단건 예약은 이용 완료로.
  update public.reservations r
  set status = 'completed'
  where r.status = 'confirmed'
    and r.deleted_at is null
    and r.access_start_date is null
    and r.start_time is not null
    and r.end_time is not null
    and r.upgraded_into is null
    and (
      (r.date + r.end_time)
      + case when r.end_time <= r.start_time then interval '1 day' else interval '0' end
    ) at time zone 'Asia/Seoul' < v_now
    and exists (select 1 from public.attendance a where a.reservation_id = r.id);
  get diagnostics v_completed = row_count;

  return jsonb_build_object(
    'ok', true,
    'closed_booked', v_closed_booked,
    'closed_open', v_closed_open,
    'completed', v_completed
  );
end;
$$;

comment on function public.close_finished_visits() is
  '이용 시간이 끝난 입실 기록을 닫고, 다녀간 단건 예약을 이용 완료로 바꾼다. 5분마다 크론이 부른다.';

revoke all on function public.close_finished_visits() from public, anon;
grant execute on function public.close_finished_visits() to authenticated, service_role;
