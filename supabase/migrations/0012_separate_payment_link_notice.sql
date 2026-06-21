-- Payment links are created per transaction at the POS and sent separately
-- after the operator has reviewed the reservation.
insert into public.space_settings (key, value)
values (
  'payment_notice',
  '예약 확인 후 온라인 결제를 선택한 분께 별도의 결제 링크를 보내드립니다. 링크 수신 후 2시간 이내 결제해 주세요. 현장 결제는 방문 시 진행할 수 있습니다.'
)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
