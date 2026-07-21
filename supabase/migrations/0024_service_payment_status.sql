-- 결제 없이 제공한 예약을 별도로 구분한다.
-- 매출 집계는 payment_status = 'paid'만 대상으로 하므로 service는
-- 실결제 매출과 미수금에 포함되지 않는다.

alter table public.reservations
drop constraint if exists reservations_payment_status_check;

alter table public.reservations
add constraint reservations_payment_status_check
check (payment_status in ('unpaid', 'paid', 'refunded', 'service'));
