-- Payment-link workflow and observable SMS delivery history.

alter table public.reservations
  add column if not exists payment_preference text,
  add column if not exists payment_link_sent_at timestamp with time zone,
  add column if not exists payment_due_at timestamp with time zone,
  add column if not exists payment_link_send_count integer not null default 0;

alter table public.reservations disable trigger aa_guard_reservation_member_update;

update public.reservations
set payment_preference = case
  when payment_method = '현장결제' then 'onsite'
  else 'online'
end
where payment_preference is null;

alter table public.reservations enable trigger aa_guard_reservation_member_update;

alter table public.reservations
  alter column payment_preference set default 'online',
  alter column payment_preference set not null;

alter table public.reservations drop constraint if exists reservations_payment_preference_check;
alter table public.reservations
  add constraint reservations_payment_preference_check
  check (payment_preference in ('online', 'onsite'));

create table if not exists public.reservation_sms_logs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.reservations(id) on delete cascade,
  recipient_kind text not null check (recipient_kind in ('member', 'admin')),
  phone text not null,
  event text not null,
  status text not null check (status in ('succeeded', 'failed', 'skipped')),
  provider_message_id text,
  error_message text,
  created_at timestamp with time zone not null default now()
);

create index if not exists reservation_sms_logs_reservation_created_idx
on public.reservation_sms_logs (reservation_id, created_at desc);

alter table public.reservation_sms_logs enable row level security;

drop policy if exists "reservation_sms_logs_admin_select" on public.reservation_sms_logs;
create policy "reservation_sms_logs_admin_select"
on public.reservation_sms_logs
for select
to authenticated
using (public.is_admin());

grant select on public.reservation_sms_logs to authenticated;

create or replace function public.guard_reservation_payment_workflow_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    new.payment_preference := old.payment_preference;
    new.payment_link_sent_at := old.payment_link_sent_at;
    new.payment_due_at := old.payment_due_at;
    new.payment_link_send_count := old.payment_link_send_count;
  end if;
  return new;
end;
$$;

drop trigger if exists ab_guard_reservation_payment_workflow_fields on public.reservations;
create trigger ab_guard_reservation_payment_workflow_fields
before update on public.reservations
for each row execute function public.guard_reservation_payment_workflow_fields();
