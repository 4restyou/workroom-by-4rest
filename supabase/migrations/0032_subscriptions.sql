-- 월권 정기결제(빌링키 기반 자동청구).
-- 회원이 카드 빌링키를 발급하면 subscriptions에 저장하고, 매 주기(기본 4주)마다
-- 서버(portone-billing 함수)가 빌링키로 자동 청구하며 해당 월권 예약의
-- access_end_date를 연장한다. 빌링키/청구는 전부 서비스 롤(엣지 함수)에서만
-- 다루고, 회원은 자신의 구독을 조회·해지만 할 수 있다.

-- 결제 로그에 정기결제 관련 action 추가.
alter table public.reservation_payment_logs drop constraint if exists reservation_payment_logs_action_check;
alter table public.reservation_payment_logs
  add constraint reservation_payment_logs_action_check
  check (action in ('confirm', 'refund', 'subscribe', 'recurring'));

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  billing_key text not null,
  method_label text,
  pass_id uuid references public.passes(id) on delete set null,
  pass_name text not null,
  amount integer not null check (amount > 0),
  cycle_days integer not null default 28 check (cycle_days between 1 and 366),
  status text not null default 'active' check (status in ('active', 'paused', 'canceled')),
  next_charge_at date,
  last_paid_at timestamptz,
  fail_count integer not null default 0,
  created_at timestamptz default now(),
  canceled_at timestamptz
);

create index if not exists subscriptions_profile_idx on public.subscriptions (profile_id, created_at desc);
create index if not exists subscriptions_due_idx on public.subscriptions (status, next_charge_at);

alter table public.subscriptions enable row level security;

-- 회원은 자신의 구독을, 관리자는 전체를 조회할 수 있다. (수정/삭제는 함수로만)
drop policy if exists "subscriptions_select_own_or_admin" on public.subscriptions;
create policy "subscriptions_select_own_or_admin" on public.subscriptions
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

grant select on public.subscriptions to authenticated;

-- 구독 해지: 본인 또는 관리자. 빌링키를 노출하지 않도록 RPC로만 상태를 바꾼다.
create or replace function public.cancel_subscription(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'message', '로그인이 필요합니다.');
  end if;
  select profile_id into v_owner from public.subscriptions where id = p_id;
  if v_owner is null then
    return jsonb_build_object('ok', false, 'message', '구독을 찾을 수 없습니다.');
  end if;
  if v_owner <> v_uid and not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', '본인 구독만 해지할 수 있습니다.');
  end if;
  update public.subscriptions
    set status = 'canceled', canceled_at = now(), next_charge_at = null
    where id = p_id and status <> 'canceled';
  return jsonb_build_object('ok', true, 'message', '정기결제를 해지했어요. 이번 이용기간까지는 그대로 이용할 수 있어요.');
end;
$$;

grant execute on function public.cancel_subscription(uuid) to authenticated;
