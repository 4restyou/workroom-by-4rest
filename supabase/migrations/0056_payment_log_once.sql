-- 한 번의 결제가 원장에 두 번 남는 것을 막는다.
--
-- 포트원 웹훅과 손님 브라우저가 거의 동시에 같은 결제를 확인하러 온다. 둘 다
-- 예약이 아직 '미결제'인 상태를 보고, 둘 다 포트원에 조회해 승인(PAID)을
-- 확인하고, 둘 다 성공 기록을 남긴다. 실제 확인된 사례는 15~141밀리초 차이였다.
--
-- 청구는 한 번이다(같은 결제번호로 두 번 승인되지 않는다). 하지만 원장을
-- 합산하는 곳이 두 군데 있어 그대로 두면 안 된다.
--   - 매출 집계: 11,200원이 22,400원으로 잡힌다.
--   - 종일권 전환: '이미 낸 돈'이 두 배가 되어 차액을 덜 받는다.
--
-- 결제번호를 함께 남기고, 같은 결제는 한 번만 기록되게 한다.
-- 환불은 제외한다 — 부분 환불은 같은 결제번호로 여러 번 일어나는 것이 정상이다.

alter table public.reservation_payment_logs
  add column if not exists provider_payment_id text;

comment on column public.reservation_payment_logs.provider_payment_id is
  'PG 결제번호. 같은 결제가 중복 기록되지 않도록 하는 기준.';

-- 이미 쌓인 중복을 먼저 정리한다. 같은 예약·동작·금액이 몇 초 안에 두 번
-- 기록된 것만 지우고 먼저 들어온 한 줄을 남긴다.
delete from public.reservation_payment_logs a
using public.reservation_payment_logs b
where a.id > b.id
  and a.reservation_id = b.reservation_id
  and a.action = b.action
  and a.status = 'succeeded'
  and b.status = 'succeeded'
  and a.action <> 'refund'
  and coalesce(a.amount, -1) = coalesce(b.amount, -1)
  and abs(extract(epoch from (a.created_at - b.created_at))) < 5;

create unique index if not exists reservation_payment_logs_once
on public.reservation_payment_logs (reservation_id, action, provider_payment_id)
where status = 'succeeded' and provider_payment_id is not null and action <> 'refund';
