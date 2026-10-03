-- 자동 작업(크론)이 마지막으로 언제 돌았는지 남긴다.
--
-- 종료 알림·만료 알림·정기결제 자동청구는 사람이 누르지 않아도 돌아야 한다.
-- 시크릿이 바뀌거나 스케줄이 꺼지면 아무 오류 없이 조용히 멈추는데, 지금까지는
-- 손님 문의가 와야 알았다. 함수가 끝날 때마다 한 줄을 갱신하고, 오늘 운영 화면이
-- 오래 안 돈 작업을 경고한다.

create table if not exists public.cron_runs (
  job text primary key,
  last_run_at timestamptz,
  last_ok_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  last_detail jsonb
);

alter table public.cron_runs enable row level security;

drop policy if exists "cron runs admin read" on public.cron_runs;
create policy "cron runs admin read" on public.cron_runs
  for select to authenticated
  using (public.is_admin());

create or replace function public.record_cron_run(
  p_job text,
  p_ok boolean,
  p_detail jsonb default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cron_runs as c (job, last_run_at, last_ok_at, last_error_at, last_error, last_detail)
  values (
    p_job,
    now(),
    case when p_ok then now() end,
    case when p_ok then null else now() end,
    case when p_ok then null else left(p_error, 500) end,
    p_detail
  )
  on conflict (job) do update set
    last_run_at = now(),
    last_ok_at = case when p_ok then now() else c.last_ok_at end,
    last_error_at = case when p_ok then c.last_error_at else now() end,
    last_error = case when p_ok then c.last_error else left(p_error, 500) end,
    last_detail = coalesce(p_detail, c.last_detail);
end;
$$;

revoke all on function public.record_cron_run(text, boolean, jsonb, text) from public, anon, authenticated;
grant execute on function public.record_cron_run(text, boolean, jsonb, text) to service_role;
