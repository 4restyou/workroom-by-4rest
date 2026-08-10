-- 요금을 인원수만큼 받는다. 이용권마다 최소 인원을 둔다.
--
-- 예약 요약 화면은 예전부터 "14,000원 / 1인 · 2명 · 총 28,000원"처럼 인원을 곱한
-- 금액을 보여줬는데, 실제로 저장되는 price_at_booking은 이용권 정가 한 개였다.
-- 정원은 인원수만큼 차감하면서(0019: sum(people) vs capacity) 요금은 1인분만 받은 것이다.
-- 온라인 결제가 열리기 전에는 표시 불일치였지만, 지금은 화면에 적힌 금액과 카드에
-- 승인되는 금액이 다르고 그 상태로 예약이 자동 확정된다.
--
-- 여기서 금액 = 이용권 가격 x 인원 으로 통일한다. 1인 예약은 값이 그대로다.
--
-- 함께: 단체·대관처럼 일정 인원 이상만 받는 상품을 위해 passes.min_people을 둔다.
-- 클라이언트 검증만으로는 직접 INSERT를 막지 못하므로 서버에서 강제한다.

alter table public.passes
  add column if not exists min_people integer not null default 1;

alter table public.passes drop constraint if exists passes_min_people_check;
alter table public.passes
  add constraint passes_min_people_check check (min_people >= 1 and min_people <= 12);

comment on column public.passes.min_people is
  '이 이용권으로 예약할 수 있는 최소 인원. 단체·대관 상품에 쓴다(기본 1).';

create or replace function public.apply_reservation_pass_pricing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pass public.passes;
  v_privileged boolean := public.is_admin() or auth.role() = 'service_role';
begin
  -- 인원은 클라이언트 검증만 있었다. 서버에서도 막는다.
  if new.people is null or new.people < 1 or new.people > 12 then
    raise exception '인원은 1명 이상 12명 이하로 입력해 주세요.';
  end if;

  -- 상담용 문의 상품: 금액을 정하지 않는다(임의 금액 주입도 막는다).
  if new.pass_type like '%문의%' then
    new.pass_id := null;
    new.seat_type_id := null;
    new.price_at_booking := null;
    return new;
  end if;

  select * into v_pass
  from public.passes
  where name = new.pass_type and is_active = true
  order by sort_order
  limit 1;

  if found then
    -- 단체·대관처럼 최소 인원이 있는 상품. 관리자는 예외 없이 같은 규칙을 따른다
    -- (수기 예약에서 조용히 어기면 요금 계산이 어긋난다).
    if new.people < coalesce(v_pass.min_people, 1) then
      raise exception '% 이용권은 %명 이상부터 예약할 수 있습니다.', v_pass.name, v_pass.min_people;
    end if;

    -- 금액·좌석·이용권 식별자는 언제나 서버가 정한다.
    new.pass_id := v_pass.id;
    new.pass_name_snapshot := v_pass.name;
    -- 정원을 인원수만큼 차감하므로 요금도 인원수만큼 받는다.
    new.price_at_booking := v_pass.price * new.people;
    new.seat_type_id := v_pass.seat_type_id;
    return new;
  end if;

  -- 판매 중이 아닌 이용권으로는 예약할 수 없다. 관리자는 수기 예약을 위해 허용하되,
  -- 이 경우에도 회원이 보낸 값이 아니라 관리자가 입력한 값이므로 그대로 둔다.
  if not v_privileged then
    raise exception '판매 중인 이용권이 아닙니다. 예약 화면에서 다시 선택해 주세요.';
  end if;

  return new;
end;
$$;

-- 정기결제 금액도 인원을 반영한다(엣지 함수가 service_role로 호출한다).
create or replace function public.reservation_charge_amount(p_reservation_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce(p.price * greatest(coalesce(r.people, 1), 1), r.price_at_booking)
  from public.reservations r
  left join public.passes p on p.id = r.pass_id
  where r.id = p_reservation_id;
$$;

revoke all on function public.reservation_charge_amount(uuid) from public, anon, authenticated;
grant execute on function public.reservation_charge_amount(uuid) to service_role;

-- 단체·모임은 6인 이상 대관으로 운영한다. 가격(1인 기준)은 관리자 화면에서 정한다.
update public.passes set min_people = 6
where name in ('단체 및 모임 이용권', '단체·모임 이용권', '단체 및 모임 문의');
