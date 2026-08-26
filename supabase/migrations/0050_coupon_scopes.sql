-- 쿠폰 적용 범위를 이용권 종류별로 나눈다.
--
-- 0048에서는 '월권 전용'과 '전체' 둘뿐이었다. 실제로는 "시간권만 20%",
-- "주간권 첫 구매 10%" 같은 걸 주게 되므로 종류를 나눈다.
--
--   time   시간권 — 3시간권, 추가 1시간
--   day    종일권
--   week   주간권
--   month  월권 — 자유석, 지정석
--   any    전체 (단체·모임 이용권은 여기에만 걸린다)
--
-- 이름으로 판별한다. 이 프로젝트는 이미 같은 방식을 쓰고 있고(문의 상품,
-- 3시간권 길이 검사), 이용권은 관리자가 화면에서 만들기 때문에 종류 컬럼을
-- 따로 두면 새 이용권마다 지정을 잊는 쪽이 더 위험하다.

create or replace function public.pass_matches_coupon_scope(p_pass_name text, p_scope text)
returns boolean
language sql
immutable
as $$
  select case coalesce(nullif(btrim(p_scope), ''), 'any')
    when 'any' then true
    when 'time' then p_pass_name ilike '%시간%'
    when 'day' then p_pass_name ilike '%종일%'
    when 'week' then p_pass_name ilike '%주간%'
    -- month_pass 는 0048에서 쓰던 예전 값. 남아 있어도 동작하게 둔다.
    when 'month' then p_pass_name ilike '%월권%'
    when 'month_pass' then p_pass_name ilike '%월권%'
    else false
  end;
$$;

comment on function public.pass_matches_coupon_scope(text, text) is
  '이용권 이름이 쿠폰 적용 범위에 해당하는지. 프론트엔드(src/lib/coupon.ts)도 같은 규칙을 쓴다.';

-- 예전 값을 새 이름으로 옮긴다.
update public.coupons set applies_to = 'month' where applies_to = 'month_pass';

alter table public.coupons drop constraint if exists coupons_applies_to_check;
alter table public.coupons
  add constraint coupons_applies_to_check check (applies_to in ('any', 'time', 'day', 'week', 'month'));

alter table public.coupons alter column applies_to set default 'month';

comment on column public.coupons.applies_to is
  'time = 시간권, day = 종일권, week = 주간권, month = 월권, any = 전체.';

-- ── 금액 계산: 범위 검사만 새 함수로 바꾼다 ──────────────────────
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
    end if;

    v_effective := greatest(v_percent, v_coupon_percent);

    new.pass_id := v_pass.id;
    new.pass_name_snapshot := v_pass.name;
    new.discount_percent_at_booking := v_percent;
    new.coupon_percent_at_booking := v_coupon_percent;
    new.list_price_at_booking := v_pass.price * new.people;
    new.price_before_coupon := public.discounted_price(v_pass.price, v_percent) * new.people;
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

-- ── 발급 함수: 새 범위 값을 받는다 ───────────────────────────────
drop function if exists public.admin_issue_coupon(uuid, text, integer, text);

create or replace function public.admin_issue_coupon(
  p_profile_id uuid,
  p_label text default null,
  p_discount_percent integer default 10,
  p_applies_to text default 'month'
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

  -- 이름을 비우면 할인율이 곧 이름이 된다. 손님 화면에 '보상'이라고만 뜨면
  -- 뭘 받았는지 알 수 없다.
  v_label := coalesce(
    nullif(btrim(p_label), ''),
    case when v_percent > 0 then format('%s %s%% 할인', v_scope_name, v_percent) else null end,
    (select nullif(value, '') from public.space_settings where key = 'attendance_reward_label'),
    '보상'
  );

  insert into public.coupons (profile_id, label, discount_percent, applies_to)
  values (p_profile_id, v_label, v_percent, v_applies)
  returning code into v_code;

  return jsonb_build_object(
    'ok', true, 'code', v_code, 'label', v_label,
    'discount_percent', v_percent, 'applies_to', v_applies,
    'message', '쿠폰을 발급했어요.'
  );
end;
$$;

grant execute on function public.admin_issue_coupon(uuid, text, integer, text) to authenticated;
