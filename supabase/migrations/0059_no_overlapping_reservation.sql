-- 같은 회원이 시간이 겹치는 예약을 두 건 잡지 못하게 한다.
--
-- 0044는 '완전히 같은 예약'(같은 이용권·날짜·시작시간)만 막았다. 그래서
-- 13시~16시를 잡은 사람이 15시~18시를 또 잡는 것은 그대로 통과했고, 실제로
-- 겹치는 예약이 자주 생겼다. 손님은 두 건을 낸 줄 모르고 두 번 결제하게 되며,
-- 정원은 한 사람에게 두 칸이 나간다.
--
-- 막는 것은 '시간이 실제로 물리는' 경우뿐이다.
--   - 16시에 끝나고 16시에 시작하는 연장('추가 1시간')은 겹치지 않는다.
--   - 같은 날 다른 시간(오전·저녁)은 막지 않는다. 화면에서 한 번 물어본다.
--   - 장기 이용권(월권·주간권)은 제외한다 — 월권 회원이 단체 대관을 따로
--     예약하는 것은 정상이고, 기간 전체를 겹침으로 보면 그게 막힌다.
--
-- 관리자가 대신 넣는 예약은 막지 않는다. 현장에서 사정을 알고 넣는 것이다.

create or replace function public.reject_overlapping_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start integer;
  v_end integer;
  v_conflict record;
begin
  if public.is_admin() or auth.role() = 'service_role' then
    return new;
  end if;
  if new.profile_id is null or new.deleted_at is not null then
    return new;
  end if;
  if new.status not in ('pending', 'confirmed') then
    return new;
  end if;
  -- 장기 이용권은 기간으로 쓰는 상품이라 시간 겹침으로 보지 않는다.
  if new.access_start_date is not null then
    return new;
  end if;
  if new.start_time is null or new.end_time is null then
    return new;
  end if;

  v_start := extract(hour from new.start_time) * 60 + extract(minute from new.start_time);
  v_end := extract(hour from new.end_time) * 60 + extract(minute from new.end_time);
  -- 자정을 넘기면 다음 날로 이어 센다.
  if v_end <= v_start then v_end := v_end + 24 * 60; end if;

  select r.id,
         coalesce(r.pass_name_snapshot, r.pass_type) as pass_name,
         to_char(r.start_time, 'HH24:MI') as from_time,
         to_char(r.end_time, 'HH24:MI') as to_time
  into v_conflict
  from public.reservations r
  where r.profile_id = new.profile_id
    and r.id is distinct from new.id
    and r.date = new.date
    and r.deleted_at is null
    and r.status in ('pending', 'confirmed')
    and r.access_start_date is null
    and r.start_time is not null
    and r.end_time is not null
    and r.upgraded_into is null
    -- 끝나는 시각과 시작하는 시각이 같은 것은 겹침이 아니다.
    and v_start < (
      case
        when extract(hour from r.end_time) * 60 + extract(minute from r.end_time)
             <= extract(hour from r.start_time) * 60 + extract(minute from r.start_time)
        then extract(hour from r.end_time) * 60 + extract(minute from r.end_time) + 24 * 60
        else extract(hour from r.end_time) * 60 + extract(minute from r.end_time)
      end
    )
    and v_end > extract(hour from r.start_time) * 60 + extract(minute from r.start_time)
  limit 1;

  if found then
    raise exception '이미 % 예약(%~%)이 있습니다. 시간이 겹치지 않게 선택해 주세요.',
      v_conflict.pass_name, v_conflict.from_time, v_conflict.to_time;
  end if;

  return new;
end;
$$;

drop trigger if exists ab_reject_overlapping_reservation on public.reservations;
create trigger ab_reject_overlapping_reservation
  before insert or update of date, start_time, end_time, status on public.reservations
  for each row execute function public.reject_overlapping_reservation();
