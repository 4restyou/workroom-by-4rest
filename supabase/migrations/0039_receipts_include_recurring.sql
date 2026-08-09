-- 정기결제도 회원 결제 내역에 보이게 한다.
--
-- 0038은 action이 'confirm'·'refund'인 기록만 열어 뒀는데, 정기결제는
-- 'subscribe'(첫 회차)와 'recurring'(4주마다 자동청구)으로 남는다.
-- 그래서 정작 결제 내역이 가장 필요한 월권 회원 화면이 비어 있었다.
-- (자동청구는 회원이 결제창을 보지 않으므로 기록이 유일한 확인 수단이다.)

drop policy if exists "reservation_payment_logs_member_select" on public.reservation_payment_logs;
create policy "reservation_payment_logs_member_select"
on public.reservation_payment_logs
for select
to authenticated
using (
  status = 'succeeded'
  and action in ('confirm', 'refund', 'subscribe', 'recurring')
  and exists (
    select 1
    from public.reservations r
    where r.id = reservation_payment_logs.reservation_id
      and r.profile_id = auth.uid()
  )
);

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
  and l.action in ('confirm', 'refund', 'subscribe', 'recurring');

grant select on public.my_payment_receipts to authenticated;
