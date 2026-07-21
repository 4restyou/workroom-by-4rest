-- PG(포트원) 전환 + 예약 가능 기간 제한.
-- 1) 예약은 이용일 기준 오늘(KST)부터 최대 2개월 이내까지만 허용.
--    (관리자·service_role은 예외 — 장기 협의 예약을 수기로 등록할 수 있게)
-- 2) 결제 링크 안내 문구를 PG(사이트 내 카드결제) 기준으로 갱신하고,
--    취소·환불 문구에 일반/정기결제 규정을 명시.

-- 1) 예약 가능 기간 제한 트리거
create or replace function public.validate_reservation_booking_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;
  if new.date > v_today + interval '2 months' then
    raise exception '예약은 이용일 기준 오늘부터 최대 2개월 이내까지만 가능합니다.';
  end if;
  return new;
end;
$$;

drop trigger if exists ac_reservation_booking_window on public.reservations;
create trigger ac_reservation_booking_window
before insert or update of date on public.reservations
for each row execute function public.validate_reservation_booking_window();

-- 2) 안내 문구 갱신 (운영자가 설정 화면에서 다시 수정 가능)
insert into public.space_settings (key, value)
values
  (
    'payment_notice',
    '온라인 결제는 예약 확정 후 ‘예약현황’에서 카드로 바로 결제할 수 있습니다. 현장 결제(카드·현금)를 원하시면 방문 전 별도로 문의해 주세요. 월권(자유석·지정석)은 정기결제로 이용할 수 있습니다.'
  ),
  (
    'cancellation_notice',
    '일반 결제는 이용 시작 전 취소 시 전액 환불되며, 시작 시간이 지난 뒤에는 취소·환불이 어렵습니다. 정기결제(월권)는 다음 결제일 전 언제든 해지할 수 있고, 이용 기간 중 환불 시 이용 일수를 일할 계산해 차감한 잔액을 환불합니다. 예약은 이용일 기준 오늘부터 최대 2개월 이내까지 가능합니다.'
  )
on conflict (key) do update
set value = excluded.value, updated_at = now();
