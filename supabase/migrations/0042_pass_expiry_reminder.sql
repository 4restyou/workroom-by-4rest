-- 장기 이용권(주간권·월권) 만료 임박 안내.
--
-- 지금 있는 알림은 시간권이 20분 뒤 끝난다는 것뿐이고(0018/0019), 그 함수는
-- access_start_date가 null인 예약만 본다. 즉 월권·주간권 회원은 이용권이 끝나는
-- 날까지 아무 안내도 받지 못했고, 만료된 뒤에야 '예약이 없다'는 사실을 알게 됐다.
-- 운영자 입장에서도 재구매를 권할 시점을 놓친다.
--
-- 여기서는 만료 3일 전에 한 번만 보내는 안내를 추가한다. 같은 예약에 두 번 가지
-- 않도록 end reminder와 같은 '선점 후 발송' 방식을 쓴다.

alter table public.reservations
  add column if not exists expiry_reminder_attempted_at timestamp with time zone,
  add column if not exists expiry_reminder_sent_at timestamp with time zone;

-- 회원이 자기 예약을 수정할 때 알림 기록을 지우지 못하게 한다(0018과 같은 방식).
create or replace function public.guard_reservation_access_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    new.access_start_date := old.access_start_date;
    new.access_end_date := old.access_end_date;
    new.access_weekdays := old.access_weekdays;
    new.access_paused_from := old.access_paused_from;
    new.access_paused_until := old.access_paused_until;
    new.end_reminder_attempted_at := old.end_reminder_attempted_at;
    new.end_reminder_sent_at := old.end_reminder_sent_at;
    new.expiry_reminder_attempted_at := old.expiry_reminder_attempted_at;
    new.expiry_reminder_sent_at := old.expiry_reminder_sent_at;
  end if;
  return new;
end;
$$;

-- 이용 기간이 바뀌면(연장·정기결제 갱신) 다음 만료에 대해 다시 안내해야 한다.
create or replace function public.reset_reservation_expiry_reminder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.access_end_date is distinct from old.access_end_date then
    new.expiry_reminder_attempted_at := null;
    new.expiry_reminder_sent_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists zy_reset_reservation_expiry_reminder on public.reservations;
create trigger zy_reset_reservation_expiry_reminder
before update of access_end_date on public.reservations
for each row execute function public.reset_reservation_expiry_reminder();

-- 만료 3일 전(당일 포함)인 장기 이용권을 한 번만 선점해 돌려준다.
create or replace function public.claim_pass_expiry_reminders()
returns table (
  reservation_id uuid,
  member_name text,
  phone text,
  access_end_date date,
  days_left integer,
  pass_name text
)
language sql
security definer
set search_path = public
as $$
  update public.reservations r
  set expiry_reminder_attempted_at = now()
  from (
    select r2.id
    from public.reservations r2
    where r2.status = 'confirmed'
      and r2.deleted_at is null
      and r2.access_end_date is not null
      and r2.expiry_reminder_attempted_at is null
      and r2.access_end_date >= (now() at time zone 'Asia/Seoul')::date
      and r2.access_end_date <= (now() at time zone 'Asia/Seoul')::date + 3
      -- 이미 해지·환불된 이용권에는 보내지 않는다.
      and coalesce(r2.payment_status, 'unpaid') <> 'refunded'
    for update skip locked
  ) candidate
  where r.id = candidate.id
  returning
    r.id,
    r.name,
    r.phone,
    r.access_end_date,
    (r.access_end_date - (now() at time zone 'Asia/Seoul')::date)::integer,
    coalesce(r.pass_name_snapshot, r.pass_type);
$$;

revoke all on function public.claim_pass_expiry_reminders() from public, anon, authenticated;
grant execute on function public.claim_pass_expiry_reminders() to service_role;

-- 만료 임박 조회는 운영자 화면에서도 쓰므로 인덱스를 둔다.
create index if not exists reservations_access_end_idx
  on public.reservations (access_end_date)
  where access_end_date is not null and deleted_at is null;
