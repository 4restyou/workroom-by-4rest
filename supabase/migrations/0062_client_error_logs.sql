-- 손님 화면에서 난 오류를 모은다.
--
-- 지금까지는 "잠시 문제가 발생했어요"가 떠도 손님이 캡처해 보내 주기 전에는
-- 무슨 일이 있었는지 알 수 없었다. 화면이 스스로 한 줄씩 남기고, 관리자만 읽는다.
-- 개인정보는 남기지 않는다(메시지·화면 경로·브라우저 정보·로그인 여부만).

create table if not exists public.client_error_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  profile_id uuid default auth.uid() references public.profiles(id) on delete set null,
  kind text not null check (kind in ('render', 'error', 'rejection')),
  message text not null check (char_length(message) <= 500),
  stack text check (char_length(stack) <= 2000),
  path text check (char_length(path) <= 200),
  app_version text check (char_length(app_version) <= 40),
  user_agent text check (char_length(user_agent) <= 300)
);

create index if not exists client_error_logs_created_at_idx on public.client_error_logs (created_at desc);

alter table public.client_error_logs enable row level security;

drop policy if exists "client errors insert" on public.client_error_logs;
create policy "client errors insert" on public.client_error_logs
  for insert to anon, authenticated
  with check (profile_id is null or profile_id = auth.uid());

drop policy if exists "client errors admin read" on public.client_error_logs;
create policy "client errors admin read" on public.client_error_logs
  for select to authenticated
  using (public.is_admin());

drop policy if exists "client errors admin delete" on public.client_error_logs;
create policy "client errors admin delete" on public.client_error_logs
  for delete to authenticated
  using (public.is_admin());

-- 한꺼번에 쏟아지는 경우(무한 루프 등)에도 표가 끝없이 커지지 않게 30일 지난 건 지운다.
create or replace function public.prune_client_error_logs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if random() < 0.02 then
    delete from public.client_error_logs where created_at < now() - interval '30 days';
  end if;
  return null;
end;
$$;

drop trigger if exists prune_client_error_logs on public.client_error_logs;
create trigger prune_client_error_logs
  after insert on public.client_error_logs
  for each statement execute function public.prune_client_error_logs();
