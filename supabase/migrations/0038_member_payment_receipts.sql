-- 회원에게 결제·환불 기록을 보여준다.
--
-- reservation_payment_logs에는 결제 일시·금액·환불 내역이 모두 남지만 SELECT 정책이
-- 관리자뿐이어서, 회원은 자기 결제가 언제 얼마나 이루어졌는지 확인할 방법이 없었다.
-- (예약 카드에는 '결제완료' 배지와 정가만 보인다. 부분 환불이 있으면 실제 결제액과
--  화면 금액이 달라진다.)
--
-- 전자상거래법상 거래기록 열람 요구를 감안해, 회원 본인 예약의 '성공한' 결제·환불
-- 기록만 읽을 수 있게 한다. 실패·요청 로그와 provider_code 같은 내부 진단 값은
-- 운영자만 봐야 하므로 뷰로 컬럼을 좁힌다.

drop policy if exists "reservation_payment_logs_member_select" on public.reservation_payment_logs;
create policy "reservation_payment_logs_member_select"
on public.reservation_payment_logs
for select
to authenticated
using (
  status = 'succeeded'
  and action in ('confirm', 'refund')
  and exists (
    select 1
    from public.reservations r
    where r.id = reservation_payment_logs.reservation_id
      and r.profile_id = auth.uid()
  )
);

-- 회원 화면이 읽는 최소 컬럼만 노출하는 뷰. security_invoker로 두어 위 정책이 그대로 적용된다.
create or replace view public.my_payment_receipts
with (security_invoker = true)
as
select
  l.id,
  l.reservation_id,
  l.action,
  l.amount,
  l.created_at
from public.reservation_payment_logs l
where l.status = 'succeeded'
  and l.action in ('confirm', 'refund');

grant select on public.my_payment_receipts to authenticated;
