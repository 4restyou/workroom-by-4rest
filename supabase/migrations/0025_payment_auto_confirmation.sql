-- 온라인 결제 성공 시 예약을 자동 확정한다.
-- 취소·이용완료·노쇼 상태에서 뒤늦게 확인된 결제는 상태를 덮어쓰지 않아
-- 운영자가 환불 여부를 확인할 수 있게 한다.

create or replace function public.auto_confirm_paid_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_status = 'paid' and new.status = 'pending' then
    new.status := 'confirmed';
  end if;
  return new;
end;
$$;

drop trigger if exists ad_auto_confirm_paid_reservation on public.reservations;
create trigger ad_auto_confirm_paid_reservation
before insert or update of payment_status on public.reservations
for each row execute function public.auto_confirm_paid_reservation();

insert into public.space_settings (key, value)
values (
  'payment_notice',
  '온라인 예약은 신청 직후 카드로 결제할 수 있으며, 결제가 완료되면 예약이 자동 확정되고 확정 문자가 발송됩니다. 현장 결제와 별도 확인이 필요한 예약은 운영자가 확인한 뒤 확정합니다.'
)
on conflict (key) do update
set value = excluded.value, updated_at = now();
