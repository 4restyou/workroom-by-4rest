-- Member notes and auditable attendance corrections for administrators.

alter table public.profiles
  add column if not exists admin_note text;

create or replace function public.prevent_member_privilege_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or auth.uid() is null or public.is_admin() then
    return new;
  end if;

  new.role = old.role;
  new.membership_status = old.membership_status;
  new.admin_note = old.admin_note;
  return new;
end;
$$;

drop policy if exists "attendance_admin_update" on public.attendance;
create policy "attendance_admin_update"
on public.attendance
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "attendance_admin_delete" on public.attendance;
create policy "attendance_admin_delete"
on public.attendance
for delete
to authenticated
using (public.is_admin());

grant delete on public.attendance to authenticated;

create table if not exists public.attendance_audit_logs (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid,
  profile_id uuid references public.profiles(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('update', 'delete')),
  before_check_in_at timestamp with time zone,
  after_check_in_at timestamp with time zone,
  before_check_out_at timestamp with time zone,
  after_check_out_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create index if not exists attendance_audit_logs_attendance_idx
  on public.attendance_audit_logs (attendance_id, created_at desc);

alter table public.attendance_audit_logs enable row level security;

drop policy if exists "attendance_audit_logs_admin_select" on public.attendance_audit_logs;
create policy "attendance_audit_logs_admin_select"
on public.attendance_audit_logs
for select
to authenticated
using (public.is_admin());

grant select on public.attendance_audit_logs to authenticated;

create or replace function public.log_attendance_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return coalesce(new, old);
  end if;

  insert into public.attendance_audit_logs (
    attendance_id,
    profile_id,
    actor_id,
    action,
    before_check_in_at,
    after_check_in_at,
    before_check_out_at,
    after_check_out_at
  ) values (
    old.id,
    old.profile_id,
    auth.uid(),
    case when tg_op = 'DELETE' then 'delete' else 'update' end,
    old.check_in_at,
    case when tg_op = 'DELETE' then null else new.check_in_at end,
    old.check_out_at,
    case when tg_op = 'DELETE' then null else new.check_out_at end
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists attendance_admin_audit on public.attendance;
create trigger attendance_admin_audit
after update or delete on public.attendance
for each row execute function public.log_attendance_admin_change();
