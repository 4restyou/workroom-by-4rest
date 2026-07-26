-- 관리자가 특정 회원에게 쿠폰을 직접 발급(임의 지급)하는 RPC.
-- 쿠폰은 그동안 SECURITY DEFINER 함수(출근 카드 완성) 안에서만 생성됐고
-- coupons 테이블에는 관리자 INSERT 경로가 없었다. 이 함수로 프로모션·사과·
-- 선물 쿠폰 등을 스탬프와 무관하게 발급할 수 있다.
create or replace function public.admin_issue_coupon(
  p_profile_id uuid,
  p_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
  v_code text;
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

  -- 라벨 미입력 시 출근 보상 라벨을 기본값으로 사용한다.
  v_label := coalesce(
    nullif(btrim(p_label), ''),
    (select nullif(value, '') from public.space_settings where key = 'attendance_reward_label'),
    '보상'
  );

  insert into public.coupons (profile_id, label)
  values (p_profile_id, v_label)
  returning code into v_code;

  return jsonb_build_object('ok', true, 'code', v_code, 'label', v_label, 'message', '쿠폰을 발급했어요.');
end;
$$;

grant execute on function public.admin_issue_coupon(uuid, text) to authenticated;
