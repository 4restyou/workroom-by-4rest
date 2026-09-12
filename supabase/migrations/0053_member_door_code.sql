-- 회원이 방문 안내 화면에서 출입구 비밀번호를 볼 수 있게 한다.
--
-- 비밀번호는 관리자만 읽는 설정이다(0052). 화면에 보여 주려고 그 정책을 다시
-- 열면 로그인만 하면 누구나 읽게 된다 — 예약한 적 없는 사람, 오래전에 끊은
-- 사람까지. 대신 '오늘 들어올 자격이 있는가'를 확인하고 값만 돌려주는 함수를 둔다.
--
-- 자격 판정은 출석 체크인(attendance_check_in)이 쓰는 것과 같은 규칙이다.
-- 그 함수에는 아직 같은 조건이 안에 적혀 있다 — 다음에 그 함수를 손볼 때
-- 이 함수를 부르도록 바꾸면 규칙이 한 곳에만 남는다.

create or replace function public.has_access_today(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.reservations r
    where r.profile_id = p_profile_id
      and r.status = 'confirmed'
      and r.deleted_at is null
      and coalesce(r.payment_status, 'unpaid') <> 'refunded'
      and (
        -- 단건 예약: 오늘 것이거나, 자정을 넘겨 이어지는 어제 예약.
        (
          r.access_start_date is null
          and (
            r.date = (now() at time zone 'Asia/Seoul')::date
            or (r.date = (now() at time zone 'Asia/Seoul')::date - 1 and r.end_time <= r.start_time)
          )
        )
        -- 장기 이용권: 기간 안이고, 이용 요일이고, 일시정지도 휴무도 아닌 날.
        or (
          r.access_start_date is not null
          and (now() at time zone 'Asia/Seoul')::date between r.access_start_date and r.access_end_date
          and extract(dow from (now() at time zone 'Asia/Seoul')::date)::smallint = any(r.access_weekdays)
          and not (
            r.access_paused_from is not null
            and (now() at time zone 'Asia/Seoul')::date between r.access_paused_from and r.access_paused_until
          )
          and not exists (
            select 1 from public.business_date_exceptions e
            where e.date = (now() at time zone 'Asia/Seoul')::date and e.is_closed
          )
        )
      )
  );
$$;

comment on function public.has_access_today(uuid) is
  '이 회원이 오늘 공간에 들어올 자격이 있는지. 출입구 비밀번호 공개 판단에 쓴다.';

/**
 * 오늘 이용 자격이 있으면 출입구 비밀번호를, 없으면 null 을 돌려준다.
 * 관리자는 언제나 받는다.
 */
create or replace function public.member_door_code()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return null; end if;
  if not (public.is_admin() or public.has_access_today(v_uid)) then return null; end if;
  return (select nullif(btrim(value), '') from public.space_settings where key = 'door_code');
end;
$$;

revoke all on function public.has_access_today(uuid) from public, anon;
revoke all on function public.member_door_code() from public, anon;
grant execute on function public.has_access_today(uuid) to authenticated;
grant execute on function public.member_door_code() to authenticated;
