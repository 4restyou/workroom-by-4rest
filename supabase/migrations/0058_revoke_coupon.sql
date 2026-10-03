-- 발급한 쿠폰을 회수한다.
--
-- 발급은 되는데 되돌릴 방법이 없었다. 잘못된 사람에게 줬거나, 할인율을 잘못
-- 넣었거나, 약속이 틀어진 경우에 손을 쓸 수 없다.
--
-- 이미 쓴 쿠폰은 회수하지 않는다 — 그건 지난 거래의 근거다.
--
-- 아직 결제하지 않은 예약에 붙어 있는 쿠폰이면, 먼저 그 예약에서 떼어낸다.
-- 그냥 지우면 예약의 coupon_id 만 비고 할인된 금액은 그대로 남아, 손님이
-- 쿠폰 없이 할인가로 결제하게 된다.

create or replace function public.admin_revoke_coupon(p_coupon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon public.coupons;
  v_detached integer := 0;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', '관리자만 회수할 수 있습니다.');
  end if;

  select * into v_coupon from public.coupons where id = p_coupon_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', '존재하지 않는 쿠폰입니다.');
  end if;
  if v_coupon.status = 'used' then
    return jsonb_build_object('ok', false, 'message', '이미 사용한 쿠폰은 회수할 수 없습니다.');
  end if;

  -- 결제가 끝난 예약에 붙어 있으면 손대지 않는다(금액이 이미 승인됐다).
  if exists (
    select 1 from public.reservations r
    where r.coupon_id = p_coupon_id and coalesce(r.payment_status, 'unpaid') = 'paid'
  ) then
    return jsonb_build_object('ok', false, 'message', '결제가 끝난 예약에 사용된 쿠폰입니다.');
  end if;

  -- 아직 결제 전인 예약에서 떼어낸다. UPDATE가 가격 트리거를 다시 태워
  -- 금액이 정가(또는 이용권 할인가)로 돌아간다.
  update public.reservations
  set coupon_id = null
  where coupon_id = p_coupon_id;
  get diagnostics v_detached = row_count;

  delete from public.coupons where id = p_coupon_id;

  return jsonb_build_object(
    'ok', true,
    'detached', v_detached,
    'message', case
      when v_detached > 0 then format('쿠폰을 회수했습니다. 예약 %s건의 금액이 원래대로 돌아갔습니다.', v_detached)
      else '쿠폰을 회수했습니다.'
    end
  );
end;
$$;

revoke all on function public.admin_revoke_coupon(uuid) from public, anon;
grant execute on function public.admin_revoke_coupon(uuid) to authenticated;
