-- 관리자가 할인율을 정해서 쿠폰을 발급한다.
--
-- 0048에서 쿠폰이 결제에 붙게 됐지만, 발급 함수는 여전히 이름만 받았다.
-- 그래서 모든 쿠폰이 기본값(월권 10%)으로만 나갔다. 사과 쿠폰 20%, 첫 방문
-- 5% 같은 걸 주려면 할인율을 발급할 때 정할 수 있어야 한다.
--
-- 인자가 늘었으므로 예전 2-인자 함수는 지운다. 둘 다 남으면 PostgREST가
-- 어느 것을 부를지 못 정해 발급 자체가 실패한다.

drop function if exists public.admin_issue_coupon(uuid, text);

create or replace function public.admin_issue_coupon(
  p_profile_id uuid,
  p_label text default null,
  p_discount_percent integer default 10,
  p_applies_to text default 'month_pass'
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
  v_applies text := coalesce(nullif(btrim(p_applies_to), ''), 'month_pass');
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
  if v_applies not in ('month_pass', 'any') then
    return jsonb_build_object('ok', false, 'message', '쿠폰을 쓸 수 있는 범위가 올바르지 않습니다.');
  end if;

  -- 이름을 비우면 할인율이 곧 이름이 된다. 손님 화면에 '보상'이라고만 뜨면
  -- 뭘 받았는지 알 수 없다.
  v_label := coalesce(
    nullif(btrim(p_label), ''),
    case
      when v_percent > 0 and v_applies = 'month_pass' then format('월권 %s%% 할인', v_percent)
      when v_percent > 0 then format('전 이용권 %s%% 할인', v_percent)
      else null
    end,
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
