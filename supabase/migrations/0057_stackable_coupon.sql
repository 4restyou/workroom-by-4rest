-- 쿠폰을 이용권 할인과 겹쳐 쓸지 쿠폰마다 정한다.
--
-- 지금은 둘이 겹치면 더 유리한 쪽 하나만 적용한다(0048). 판촉 기간에 쿠폰이
-- 사실상 무력해지는데, 그게 맞을 때도 있고 아닐 때도 있다 — 사과 쿠폰이나
-- 특별히 챙겨 드리는 분께는 겹쳐 드리고 싶다.
--
-- 겹칠 때는 순차로 깎는다. 두 할인율을 더하면 합이 100%를 넘어 공짜가 된다.
--   14,000 → 20% → 11,200 → 10% → 10,080
--
-- 기본값은 '중복 불가'다. 발급할 때 명시적으로 켜야 겹친다.

alter table public.coupons
  add column if not exists stackable boolean not null default false;

comment on column public.coupons.stackable is
  '이용권 할인과 겹쳐 쓸 수 있는가. false면 더 유리한 쪽 하나만 적용된다.';

alter table public.reservations
  add column if not exists coupon_stacked boolean not null default false;

comment on column public.reservations.coupon_stacked is
  '이 예약에서 쿠폰이 이용권 할인과 겹쳐 적용됐는가. 결제 직전 금액 대조에 쓴다.';

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
  v_stacked boolean := false;
  v_unit integer;
begin
  if new.people is null or new.people < 1 or new.people > 12 then
    raise exception '인원은 1명 이상 12명 이하로 입력해 주세요.';
  end if;

  if tg_op = 'UPDATE'
     and new.coupon_id is distinct from old.coupon_id
     and coalesce(old.payment_status, 'unpaid') = 'paid' then
    raise exception '결제가 끝난 예약의 쿠폰은 변경할 수 없습니다.';
  end if;

  if new.pass_type like '%문의%' then
    new.pass_id := null;
    new.seat_type_id := null;
    new.price_at_booking := null;
    new.list_price_at_booking := null;
    new.price_before_coupon := null;
    new.discount_percent_at_booking := 0;
    new.coupon_id := null;
    new.coupon_percent_at_booking := 0;
    new.coupon_stacked := false;
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

    if tg_op = 'UPDATE' then
      v_percent := coalesce(old.discount_percent_at_booking, 0);
    elsif coalesce(v_pass.discount_percent, 0) > 0
      and v_pass.discount_until is not null
      and (now() at time zone 'Asia/Seoul')::date <= v_pass.discount_until then
      v_percent := v_pass.discount_percent;
    end if;

    if new.coupon_id is not null then
      select * into v_coupon from public.coupons where id = new.coupon_id;

      if not found or v_coupon.profile_id is distinct from new.profile_id then
        raise exception '사용할 수 없는 쿠폰입니다.';
      end if;

      if v_coupon.status <> 'issued'
         and (tg_op = 'INSERT' or old.coupon_id is distinct from new.coupon_id) then
        raise exception '이미 사용한 쿠폰입니다.';
      end if;

      if coalesce(v_coupon.discount_percent, 0) <= 0 then
        raise exception '이 쿠폰은 결제 할인에 사용할 수 없습니다.';
      end if;

      if not public.pass_matches_coupon_scope(v_pass.name, v_coupon.applies_to) then
        raise exception '이 쿠폰은 % 결제에 사용할 수 없습니다.', v_pass.name;
      end if;

      v_coupon_percent := v_coupon.discount_percent;
      v_stacked := coalesce(v_coupon.stackable, false);
    end if;

    -- 이용권 할인까지 적용한 1인 금액. 정기결제 기준액도 여기서 나온다.
    v_unit := public.discounted_price(v_pass.price, v_percent);

    new.pass_id := v_pass.id;
    new.pass_name_snapshot := v_pass.name;
    new.discount_percent_at_booking := v_percent;
    new.coupon_percent_at_booking := v_coupon_percent;
    new.coupon_stacked := v_stacked and v_coupon_percent > 0;
    new.list_price_at_booking := v_pass.price * new.people;
    new.price_before_coupon := v_unit * new.people;

    -- 겹치면 순차로, 아니면 더 유리한 쪽 하나만.
    new.price_at_booking := (
      case
        when v_coupon_percent <= 0 then v_unit
        when v_stacked then public.discounted_price(v_unit, v_coupon_percent)
        else public.discounted_price(v_pass.price, greatest(v_percent, v_coupon_percent))
      end
    ) * new.people;

    new.seat_type_id := v_pass.seat_type_id;
    return new;
  end if;

  if not v_privileged then
    raise exception '판매 중인 이용권이 아닙니다. 예약 화면에서 다시 선택해 주세요.';
  end if;

  return new;
end;
$$;

-- ── 발급 함수: 중복 여부를 받는다 ────────────────────────────────
drop function if exists public.admin_issue_coupon(uuid, text, integer, text);

create or replace function public.admin_issue_coupon(
  p_profile_id uuid,
  p_label text default null,
  p_discount_percent integer default 10,
  p_applies_to text default 'month',
  p_stackable boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
  v_code text;
  v_percent integer := coalesce(p_discount_percent, 10);
  v_applies text := coalesce(nullif(btrim(p_applies_to), ''), 'month');
  v_stackable boolean := coalesce(p_stackable, false);
  v_scope_name text;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', '관리자만 쿠폰을 발급할 수 있습니다.');
  end if;
  if p_profile_id is null then
    return jsonb_build_object('ok', false, 'message', '회원을 선택해 주세요.');
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    return jsonb_build_object('ok', false, 'message', '존재하지 않는 회원입니다.');
  end if;
  if v_percent < 0 or v_percent > 90 then
    return jsonb_build_object('ok', false, 'message', '할인율은 0%에서 90% 사이로 정해 주세요.');
  end if;

  if v_applies = 'month_pass' then v_applies := 'month'; end if;
  v_scope_name := case v_applies
    when 'time' then '시간권'
    when 'day' then '종일권'
    when 'week' then '주간권'
    when 'month' then '월권'
    when 'any' then '전 이용권'
    else null
  end;
  if v_scope_name is null then
    return jsonb_build_object('ok', false, 'message', '쿠폰을 쓸 수 있는 범위가 올바르지 않습니다.');
  end if;

  v_label := coalesce(
    nullif(btrim(p_label), ''),
    case
      when v_percent > 0 and v_stackable then format('%s %s%% 할인 (중복 가능)', v_scope_name, v_percent)
      when v_percent > 0 then format('%s %s%% 할인', v_scope_name, v_percent)
      else null
    end,
    (select nullif(value, '') from public.space_settings where key = 'attendance_reward_label'),
    '보상'
  );

  insert into public.coupons (profile_id, label, discount_percent, applies_to, stackable)
  values (p_profile_id, v_label, v_percent, v_applies, v_stackable)
  returning code into v_code;

  return jsonb_build_object(
    'ok', true, 'code', v_code, 'label', v_label,
    'discount_percent', v_percent, 'applies_to', v_applies, 'stackable', v_stackable,
    'message', '쿠폰을 발급했어요.'
  );
end;
$$;

grant execute on function public.admin_issue_coupon(uuid, text, integer, text, boolean) to authenticated;

-- ── 이미 발급된 쿠폰의 중복 여부를 바꾼다 ────────────────────────
create or replace function public.admin_set_coupon_stackable(p_coupon_id uuid, p_stackable boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', '관리자만 변경할 수 있습니다.');
  end if;

  update public.coupons
  set stackable = coalesce(p_stackable, false)
  where id = p_coupon_id and status = 'issued';

  if not found then
    return jsonb_build_object('ok', false, 'message', '사용 가능한 쿠폰이 아닙니다.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', case when p_stackable then '이용권 할인과 겹쳐 쓸 수 있습니다.' else '더 유리한 할인 하나만 적용됩니다.' end
  );
end;
$$;

revoke all on function public.admin_set_coupon_stackable(uuid, boolean) from public, anon;
grant execute on function public.admin_set_coupon_stackable(uuid, boolean) to authenticated;
