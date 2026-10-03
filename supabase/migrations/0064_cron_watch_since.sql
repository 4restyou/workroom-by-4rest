-- 자동 작업 감시를 "언제부터" 했는지 기록한다.
--
-- 0063을 적용한 직후에는 기록이 하나도 없어서, 하루 한 번 도는 만료 알림까지
-- 곧바로 '멈췄다'고 경고했다. 감시 시작 시각을 남기고, 그 작업의 주기가 한 번
-- 지나기 전에는 '기록 없음'을 문제로 보지 않는다.

alter table public.cron_runs
  add column if not exists watch_since timestamptz not null default now();

insert into public.cron_runs (job)
values ('reservation-end-reminder'), ('pass-expiry-reminder'), ('portone-billing')
on conflict (job) do nothing;
