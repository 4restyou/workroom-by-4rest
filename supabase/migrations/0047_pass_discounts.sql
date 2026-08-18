-- 이용권 할인.
--
-- "이번 달까지 종일권 20%" 같은 판촉을 운영자가 직접 걸 수 있게 한다.
-- 할인율과 종료일을 이용권마다 두고, 종료일이 지나면 자동으로 정가로 돌아간다.
--
-- 금액은 반드시 여기(서버)에서 정한다. 화면에만 할인가를 그리면 카드에는 정가가
-- 승인된다 — 2인 예약이 14,000원으로 저장됐던 사고와 같은 구조다.
--
-- 예약에는 '그때 얼마였는지'를 함께 남긴다. 할인이 끝난 뒤에 예약을 다시 열어도
-- 금액이 바뀌지 않아야 하고, 손님에게 정가와 할인가를 같이 보여줘야 하기 때문이다.

alter table public.passes
  add column if not exists discount_percent integer not null default 0,
  add column if not exists discount_until date;

comment on column public.passes.discount_percent is '할인율(%). 0이면 할인 없음.';
comment on column public.passes.discount_until is '할인 마지막 날(이 날까지 예약하면 할인). 할인율이 있으면 필수.';

alter table public.passes drop constraint if exists passes_discount_percent_check;
alter table public.passes
  add constraint passes_discount_percent_check check (discount_percent >= 0 and discount_percent <= 90);

-- 종료일 없는 할인은 잊혀진 채로 계속 돌아가 매출이 조용히 샌다. 짝을 강제한다.
alter table public.passes drop constraint if exists passes_discount_until_required;
alter table public.passes
  add constraint passes_discount_until_required check (discount_percent = 0 or discount_until is not null);

alter table public.reservations
  add column if not exists list_price_at_booking integer,
  add column if not exists discount_percent_at_booking integer not null default 0;

comment on column public.reservations.list_price_at_booking is '할인 전 금액(정가 x 인원). 영수증에 정가를 함께 보여주기 위한 값.';
comment on column public.reservations.discount_percent_at_booking is '예약 시점에 적용된 할인율(%).';

-- 할인가 계산은 한 곳에서만 한다. 프론트엔드(src/lib/discount.ts)도 같은 규칙을 쓴다.
-- 10원 단위로 내림 — 손님에게 유리한 쪽이고 금액이 지저분해지지 않는다.
create or replace function public.discounted_price(p_price integer, p_percent integer)
returns integer
language sql
immutable
as $$
  select case
    when p_price is null then null
    when coalesce(p_percent, 0) <= 0 then p_price
    else greatest(0, (floor(p_price * (100 - least(p_percent, 90)) / 1000.0) * 10)::integer)
  end;
$$;

comment on function public.discounted_price(integer, integer) is '정가와 할인율로 할인가를 구한다(10원 단위 내림).';

create or replace function public.apply_reservation_pass_pricing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pass public.passes;
  v_privileged boolean := public.is_admin() or auth.role() = 'service_role';
  v_percent integer := 0;
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
    new.list_price_at_booking := null;
    new.discount_percent_at_booking := 0;
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

    -- 할인은 '예약을 넣는 날' 기준이다. 이미 잡힌 예약은 할인이 끝나도 그대로 둔다
    -- (금액이 나중에 바뀌면 손님이 본 금액과 청구액이 달라진다).
    if tg_op = 'UPDATE' then
      v_percent := coalesce(old.discount_percent_at_booking, 0);
    elsif coalesce(v_pass.discount_percent, 0) > 0
      and v_pass.discount_until is not null
      and (now() at time zone 'Asia/Seoul')::date <= v_pass.discount_until then
      v_percent := v_pass.discount_percent;
    end if;

    -- 금액·좌석·이용권 식별자는 언제나 서버가 정한다.
    new.pass_id := v_pass.id;
    new.pass_name_snapshot := v_pass.name;
    -- 정원을 인원수만큼 차감하므로 요금도 인원수만큼 받는다.
    -- 할인은 1인 금액에 먼저 적용한다 — 영수증의 1인 금액이 깔끔하게 떨어진다.
    new.list_price_at_booking := v_pass.price * new.people;
    new.discount_percent_at_booking := v_percent;
    new.price_at_booking := public.discounted_price(v_pass.price, v_percent) * new.people;
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

-- 정기결제 금액은 '예약할 때 저장된 금액'을 따른다.
-- 예전에는 이용권 현재 가격으로 다시 계산했는데, 그러면 가격을 올리거나 할인이
-- 끝나는 순간 이미 구독 중인 회원의 청구액이 말없이 바뀐다.
create or replace function public.reservation_charge_amount(p_reservation_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce(r.price_at_booking, p.price * greatest(coalesce(r.people, 1), 1))
  from public.reservations r
  left join public.passes p on p.id = r.pass_id
  where r.id = p_reservation_id;
$$;

revoke all on function public.reservation_charge_amount(uuid) from public, anon, authenticated;
grant execute on function public.reservation_charge_amount(uuid) to service_role;

-- 이미 있는 예약은 할인 전 금액이 곧 정가다.
update public.reservations
set list_price_at_booking = price_at_booking
where list_price_at_booking is null and price_at_booking is not null;
