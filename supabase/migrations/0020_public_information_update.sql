-- Keep public copy, passes, and the reservation/admin settings aligned.

update public.business_hours
set open_time = time '08:00', close_time = time '01:00';

update public.passes
set description = '08:00-다음 날 01:00 / 커피 1일 3잔'
where name = '종일권';

update public.passes
set description = '월-금 08:00-다음 날 01:00 / 커피 1일 3잔'
where name = '주간권';

insert into public.space_settings (key, value)
values
  (
    'etiquette_notice',
    '냄새가 적은 간단한 음식과 음료는 가능합니다. (샌드위치, 음료 등) 통화는 조용히 부탁드리며, 음악과 영상은 이어폰 또는 헤드폰으로 이용해 주세요.'
  ),
  (
    'photo_notice',
    '상반신 증명사진 촬영은 유료입니다. 호리존 사용 시 관리자에게 문의해 주세요.'
  ),
  (
    'relax_notice',
    '오후 5시 30분부터 7시까지는 릴렉스타임으로, 메인 음악 소리가 평소보다 커질 수 있습니다.'
  ),
  (
    'location_notice',
    '전남광주통합특별시 동구 충장로5가 96-23, 2층'
  )
on conflict (key) do update
set value = excluded.value, updated_at = now();
