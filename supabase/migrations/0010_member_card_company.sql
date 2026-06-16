-- 명함에 회사명(소속) 추가.
alter table public.member_cards
  add column if not exists company text;
