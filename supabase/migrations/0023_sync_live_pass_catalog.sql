-- Keep the reproducible pass catalog aligned with the values currently used
-- by the live admin-managed catalog.

update passes
set description = '기본 이용권 / 커피 1잔',
    price = 14000,
    sort_order = 1,
    is_active = true
where name = '3시간권';

update passes
set description = '4주 기준 / 비지정석 / 커피 1일 3잔',
    price = 229000,
    sort_order = 5,
    is_active = true
where name = '월권 자유석';

update passes
set description = '현재는 일요일만 가능합니다. 09:00~22:00, 주류 및 음식 반입은 불가하며 음료와 간단한 핑거푸드는 가능합니다.',
    price = 300000,
    sort_order = 7,
    is_active = true
where name = '단체 및 모임 문의';

insert into passes (name, description, price, sort_order, is_active)
select
  '단체 및 모임 문의',
  '현재는 일요일만 가능합니다. 09:00~22:00, 주류 및 음식 반입은 불가하며 음료와 간단한 핑거푸드는 가능합니다.',
  300000,
  7,
  true
where not exists (select 1 from passes where name = '단체 및 모임 문의');
