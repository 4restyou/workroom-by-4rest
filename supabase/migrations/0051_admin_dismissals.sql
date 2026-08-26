-- '처리할 일'에서 확인한 항목을 잠시 접어 둔다.
--
-- 목록에는 눌러도 사라지지 않는 항목이 있다. 쿠폰은 회원이 쓸 때까지, 휴면
-- 회원은 다시 올 때까지, 문자 발송 실패는 기록이 남아 있는 한 계속 떠 있다.
-- 늘 떠 있는 줄이 생기면 그 목록 전체를 읽지 않게 되고, 바로 옆의 '결제
-- 미확인' 같은 진짜 급한 줄까지 같이 안 읽힌다.
--
-- 영구 삭제가 아니라 '한동안 숨기기'다. 연락은 했지만 상황이 그대로면 며칠 뒤
-- 다시 떠야 한다. 얼마나 숨길지는 항목 종류마다 화면이 정한다.
--
-- 기기마다 따로 놀면 안 되므로(휴대폰에서 확인하고 데스크톱에서 또 보게 된다)
-- 브라우저가 아니라 서버에 남긴다.

create table if not exists public.admin_dismissals (
  key text primary key,
  dismissed_at timestamptz not null default now(),
  dismissed_by uuid references public.profiles(id) on delete set null
);

comment on table public.admin_dismissals is
  '관리자가 확인 처리한 ''처리할 일'' 항목. key 는 화면이 만드는 항목 식별자.';

alter table public.admin_dismissals enable row level security;

drop policy if exists "admin_dismissals_admin_all" on public.admin_dismissals;
create policy "admin_dismissals_admin_all" on public.admin_dismissals
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.admin_dismissals to authenticated;

-- 오래된 기록은 의미가 없다. 숨김 기간이 가장 긴 항목보다 넉넉히 지난 것만 지운다.
create or replace function public.prune_admin_dismissals()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.admin_dismissals where dismissed_at < now() - interval '60 days';
$$;

revoke all on function public.prune_admin_dismissals() from public, anon;
grant execute on function public.prune_admin_dismissals() to authenticated;
