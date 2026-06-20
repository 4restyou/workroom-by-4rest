-- Keep the live booking copy aligned with the customer-facing site.
insert into public.space_settings (key, value)
values (
  'payment_notice',
  '온라인 결제는 확인 문자에 포함된 결제 링크에서 문자 수신 후 2시간 이내 완료해 주세요. 현장 결제는 방문 시 바로 진행할 수 있습니다.'
)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();
