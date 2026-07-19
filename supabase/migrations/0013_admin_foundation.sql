-- Administrator foundation hardening.
-- 1) Keep the attendance QR token and store coordinates out of public reads.
-- 2) Rotate the previously public QR token.
-- 3) Create in-app notifications for reservation events administrators act on.

drop policy if exists "space_settings_public_read" on public.space_settings;
drop policy if exists "space_settings_public_read_safe" on public.space_settings;
create policy "space_settings_public_read_safe"
on public.space_settings
for select
to anon, authenticated
using (
  key not in ('attendance_qr_token', 'attendance_lat', 'attendance_lng', 'attendance_radius_m')
  or public.is_admin()
);

update public.space_settings
set value = replace(gen_random_uuid()::text, '-', ''),
    updated_at = now()
where key = 'attendance_qr_token';

create or replace function public.notify_admin_reservation_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_body text;
begin
  if tg_op = 'INSERT' then
    v_title := '새 예약이 접수되었습니다.';
    v_body := new.name || ' · ' || coalesce(new.pass_name_snapshot, new.pass_type) || ' · ' || new.date::text;
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from new.status and new.status = 'canceled' then
      v_title := '예약이 취소되었습니다.';
      v_body := new.name || ' · ' || coalesce(new.pass_name_snapshot, new.pass_type) || ' · ' || new.date::text;
    elsif old.date is distinct from new.date
       or old.start_time is distinct from new.start_time
       or old.end_time is distinct from new.end_time then
      v_title := '예약 변경 요청이 도착했습니다.';
      v_body := new.name || ' · ' || new.date::text || ' ' || coalesce(left(new.start_time::text, 5), '') || '-' || coalesce(left(new.end_time::text, 5), '');
    else
      return new;
    end if;
  else
    return new;
  end if;

  insert into public.reservation_notifications (profile_id, reservation_id, type, title, body)
  select p.id, new.id, 'admin_reservation', v_title, left(v_body, 160)
  from public.profiles p
  where p.role = 'admin'
    and (auth.uid() is null or p.id <> auth.uid());

  return new;
end;
$$;

drop trigger if exists on_reservation_admin_insert_notification on public.reservations;
create trigger on_reservation_admin_insert_notification
after insert on public.reservations
for each row execute function public.notify_admin_reservation_event();

drop trigger if exists on_reservation_admin_update_notification on public.reservations;
create trigger on_reservation_admin_update_notification
after update of status, date, start_time, end_time on public.reservations
for each row execute function public.notify_admin_reservation_event();
