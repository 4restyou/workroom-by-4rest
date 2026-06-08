create table if not exists public.reservation_payment_logs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('confirm', 'refund')),
  status text not null check (status in ('requested', 'succeeded', 'failed', 'skipped')),
  amount integer,
  provider text not null default 'toss',
  provider_code text,
  message text,
  created_at timestamp with time zone default now()
);

create index if not exists reservation_payment_logs_reservation_created_idx
on public.reservation_payment_logs (reservation_id, created_at desc);

alter table public.reservation_payment_logs enable row level security;

drop policy if exists "reservation_payment_logs_admin_select" on public.reservation_payment_logs;
create policy "reservation_payment_logs_admin_select"
on public.reservation_payment_logs
for select
to authenticated
using (public.is_admin());

grant select on public.reservation_payment_logs to authenticated;
