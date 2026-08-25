-- 쿠폰을 실제 결제에 붙인다 (월권 10% 할인권).
--
-- 지금까지 쿠폰은 화면에만 있었다. 코드가 보이고 관리자가 '사용완료'를 눌러
-- 처리하는, 종이 쿠폰을 앱에 그려 놓은 것에 가까웠다. 온라인 결제에는 아무
-- 영향이 없어서 쿠폰을 들고도 정가를 냈다.
--
-- 금액은 서버가 정한다. 화면에서만 빼면 카드에는 정가가 승인된다.
--
-- ── 정기결제 주의 ────────────────────────────────────────────────
-- 구독(subscriptions)은 등록 시점 금액을 복사해 4주마다 그대로 청구한다.
-- 쿠폰을 price_at_booking 에 반영해 버리면 첫 달만이 아니라 해지할 때까지
-- 10%가 계속 빠진다. 쿠폰 한 장은 한 번이므로, '쿠폰 전 금액'을 따로 남기고
-- 구독에는 그 금액을 저장한다.
--
-- ── 이용권 할인(0047)과 겹칠 때 ──────────────────────────────────
-- 더 유리한 쪽 하나만 적용한다. 20% 판촉 위에 10%를 또 얹으면 운영자가
-- 예상하지 못한 금액이 나온다.

alter table public.coupons
  add column if not exists discount_percent integer not null default 10,
  add column if not exists applies_to text not null default 'month_pass',
  add column if not exists reservation_id uuid references public.reservations(id) on delete set null;

comment on column public.coupons.discount_percent is '할인율(%). 0이면 결제에 쓸 수 없는 현물 쿠폰(커피 등).';
comment on column public.coupons.applies_to is 'month_pass = 월권 결제에만, any = 모든 이용권.';
comment on column public.coupons.reservation_id is '이 쿠폰을 쓴 예약. 환불로 되돌릴 때 근거가 된다.';

alter table public.coupons drop constraint if exists coupons_discount_percent_check;
alter table public.coupons
  add constraint coupons_discount_percent_check check (discount_percent >= 0 and discount_percent <= 90);

alter table public.coupons drop constraint if exists coupons_applies_to_check;
alter table public.coupons
  add constraint coupons_applies_to_check check (applies_to in ('month_pass', 'any'));

alter table public.reservations
  add column if not exists coupon_id uuid references public.coupons(id) on delete set null,
  add column if not exists coupon_percent_at_booking integer not null default 0,
  add column if not exists price_before_coupon integer;

comment on column public.reservations.coupon_id is '이 예약에 적용한 쿠폰.';
comment on column public.reservations.coupon_percent_at_booking is '쿠폰으로 실제 적용된 할인율(%). 서버가 쿠폰에서 읽어 채운다.';
comment on column public.reservations.price_before_coupon is '쿠폰을 빼기 전 금액. 정기결제는 이 금액으로 등록된다(쿠폰은 첫 회차만).';

create index if not exists reservations_coupon_idx on public.reservations (coupon_id) where coupon_id is not null;

-- ── 금액 계산 ────────────────────────────────────────────────────
create or replace function public.apply_reservation_pass_pricing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pass public.passes;
  v_coupon public.coupons;
  v_privileged boolean := public.is_admin() or auth.role() = 'service_role';
  v_percent integer := 0;
  v_coupon_percent integer := 0;
  v_effective integer := 0;
begin
  -- 인원은 클라이언트 검증만 있었다. 서버에서도 막는다.
  if new.people is null or new.people < 1 or new.people > 12 then
    raise exception '인원은 1명 이상 12명 이하로 입력해 주세요.';
  end if;

  -- 결제가 끝난 예약의 쿠폰은 바꿀 수 없다. 이미 승인된 금액과 어긋난다.
  if tg_op = 'UPDATE'
     and new.coupon_id is distinct from old.coupon_id
     and coalesce(old.payment_status, 'unpaid') = 'paid' then
    raise exception '결제가 끝난 예약의 쿠폰은 변경할 수 없습니다.';
  end if;

  -- 상담용 문의 상품: 금액을 정하지 않는다(임의 금액 주입도 막는다).
  if new.pass_type like '%문의%' then
    new.pass_id := null;
    new.seat_type_id := null;
    new.price_at_booking := null;
    new.list_price_at_booking := null;
    new.price_before_coupon := null;
    new.discount_percent_at_booking := 0;
    new.coupon_id := null;
    new.coupon_percent_at_booking := 0;
    return new;
  end if;

  select * into v_pass
  from public.passes
  where name = new.pass_type and is_active = true
  order by sort_order
  limit 1;

  if found then
    if new.people < coalesce(v_pass.min_people, 1) then
      raise exception '% 이용권은 %명 이상부터 예약할 수 있습니다.', v_pass.name, v_pass.min_people;
    end if;

    -- 이용권 할인은 '예약을 넣는 날' 기준. 이미 잡힌 예약은 할인이 끝나도 그대로 둔다.
    if tg_op = 'UPDATE' then
      v_percent := coalesce(old.discount_percent_at_booking, 0);
    elsif coalesce(v_pass.discount_percent, 0) > 0
      and v_pass.discount_until is not null
      and (now() at time zone 'Asia/Seoul')::date <= v_pass.discount_until then
      v_percent := v_pass.discount_percent;
    end if;

    -- 쿠폰 할인율은 회원이 보낸 값을 믿지 않고 쿠폰에서 직접 읽는다.
    if new.coupon_id is not null then
      select * into v_coupon from public.coupons where id = new.coupon_id;

      if not found or v_coupon.profile_id is distinct from new.profile_id then
        raise exception '사용할 수 없는 쿠폰입니다.';
      end if;

      -- 쿠폰을 새로 붙이는 순간에만 미사용 여부를 본다.
      -- (이미 붙여 결제까지 끝난 예약을 나중에 수정할 때 막히지 않도록)
      if v_coupon.status <> 'issued'
         and (tg_op = 'INSERT' or old.coupon_id is distinct from new.coupon_id) then
        raise exception '이미 사용한 쿠폰입니다.';
      end if;

      if coalesce(v_coupon.discount_percent, 0) <= 0 then
        raise exception '이 쿠폰은 결제 할인에 사용할 수 없습니다.';
      end if;

      if v_coupon.applies_to = 'month_pass' and v_pass.name not ilike '%월권%' then
        raise exception '이 쿠폰은 월권 결제에만 사용할 수 있습니다.';
      end if;

      v_coupon_percent := v_coupon.discount_percent;
    end if;

    -- 겹치면 더 유리한 쪽 하나만.
    v_effective := greatest(v_percent, v_coupon_percent);

    new.pass_id := v_pass.id;
    new.pass_name_snapshot := v_pass.name;
    new.discount_percent_at_booking := v_percent;
    new.coupon_percent_at_booking := v_coupon_percent;
    new.list_price_at_booking := v_pass.price * new.people;
    -- 정기결제 기준액 — 쿠폰은 빼지 않는다.
    new.price_before_coupon := public.discounted_price(v_pass.price, v_percent) * new.people;
    -- 이번에 실제로 승인될 금액.
    new.price_at_booking := public.discounted_price(v_pass.price, v_effective) * new.people;
    new.seat_type_id := v_pass.seat_type_id;
    return new;
  end if;

  if not v_privileged then
    raise exception '판매 중인 이용권이 아닙니다. 예약 화면에서 다시 선택해 주세요.';
  end if;

  return new;
end;
$$;

-- ── 쿠폰 소진 · 복구 ─────────────────────────────────────────────
-- 결제가 실제로 승인된 뒤에만 소진한다. 예약에 붙이는 것만으로 사라지면,
-- 결제를 취소하거나 창을 닫은 손님의 쿠폰이 그냥 없어진다.
--
-- status = 'issued' 조건이 잠금 역할을 한다. 같은 쿠폰으로 두 건이 동시에
-- 결제되어도 한 번만 소진된다.
create or replace function public.consume_reservation_coupon(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.coupons c
  set status = 'used', used_at = now(), reservation_id = r.id
  from public.reservations r
  where r.id = p_reservation_id
    and c.id = r.coupon_id
    and c.status = 'issued';

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

create or replace function public.restore_reservation_coupon(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.coupons c
  set status = 'issued', used_at = null
  where c.reservation_id = p_reservation_id
    and c.status = 'used';

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.consume_reservation_coupon(uuid) from public, anon, authenticated;
revoke all on function public.restore_reservation_coupon(uuid) from public, anon, authenticated;
grant execute on function public.consume_reservation_coupon(uuid) to service_role;
grant execute on function public.restore_reservation_coupon(uuid) to service_role;

-- 이미 있는 예약은 쿠폰 전 금액이 곧 결제 금액이다.
do $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  update public.reservations
  set price_before_coupon = price_at_booking
  where price_before_coupon is null and price_at_booking is not null;
end $$;
