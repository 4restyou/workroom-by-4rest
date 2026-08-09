-- 결제 금액 위조 차단.
--
-- before_reservation_write는 이용권을 찾았을 때만 가격·좌석을 서버 값으로 덮어썼고,
-- 못 찾으면 아무것도 하지 않았다(else 없음). 예약 INSERT 정책도 price_at_booking을
-- 제한하지 않아, 회원이 판매 목록에 없는 pass_type(비활성 이용권, 이름 뒤 공백 등)으로
-- 직접 INSERT하면 자신이 보낸 금액이 그대로 저장됐다.
--
-- 그 금액은 결제창 금액이자 서버 검증의 기준값이라(둘 다 price_at_booking을 본다)
-- 위조 금액이 그대로 통과한다: 40,000원 종일권을 1,000원에 확정받을 수 있었다.
-- 월권이면 정기결제 금액까지 위조 금액으로 고정된다.
--
-- 또 seat_type_id를 null로 보내면 정원 검사 블록(if new.seat_type_id is not null)이
-- 통째로 건너뛰어져 정원 초과 예약이 가능했다.
--
-- 여기서는 (1) 이용권을 못 찾으면 예약을 거부하고, (2) 문의 상품은 금액을 비우며,
-- (3) 인원 범위를 서버에서 강제한다. 관리자·서비스 롤은 수기 예약을 위해 예외.

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
    -- 금액·좌석·이용권 식별자는 언제나 서버가 정한다.
    new.pass_id := v_pass.id;
    new.pass_name_snapshot := v_pass.name;
    new.price_at_booking := v_pass.price;
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

-- 가격 확정은 다른 검증(정원·운영시간)보다 먼저 끝나야 하므로 ab_ 접두사를 쓴다.
-- (aa_: 회원 필드 잠금, ab_: 가격 확정, ac_: 예약 창, zz_: 이용 기간)
drop trigger if exists ab_reservation_pass_pricing on public.reservations;
create trigger ab_reservation_pass_pricing
before insert or update on public.reservations
for each row execute function public.apply_reservation_pass_pricing();

-- 정기결제 금액도 회원이 쓸 수 있는 컬럼 대신 이용권 정가에서 다시 확인할 수 있도록
-- 조회용 함수를 둔다(엣지 함수가 service_role로 호출한다).
create or replace function public.reservation_charge_amount(p_reservation_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce(p.price, r.price_at_booking)
  from public.reservations r
  left join public.passes p on p.id = r.pass_id
  where r.id = p_reservation_id;
$$;

revoke all on function public.reservation_charge_amount(uuid) from public, anon, authenticated;
grant execute on function public.reservation_charge_amount(uuid) to service_role;
