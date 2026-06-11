-- 출근부 (attendance) + 스탬프 카드 쿠폰.
-- QR 체크인 방식: 위치정보 미수집(위치정보법 회피). 확정 예약 + 오늘 + QR 토큰으로 검증.

-- 1) 설정 기본값 (QR 토큰 / 스탬프 목표 / 보상 문구)
insert into public.space_settings (key, value) values
  ('attendance_qr_token', replace(gen_random_uuid()::text, '-', '')),
  ('attendance_stamp_goal', '10'),
  ('attendance_reward_label', '보상 (관리자 설정)')
on conflict (key) do nothing;

-- 2) 출근 기록
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  check_in_at timestamp with time zone not null default now(),
  check_out_at timestamp with time zone,
  created_at timestamp with time zone default now()
);
create index if not exists attendance_profile_idx on public.attendance (profile_id, check_in_at desc);
alter table public.attendance enable row level security;

drop policy if exists "attendance_select_own_or_admin" on public.attendance;
create policy "attendance_select_own_or_admin" on public.attendance
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "attendance_update_own" on public.attendance;
create policy "attendance_update_own" on public.attendance
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
-- 멤버 INSERT 정책 없음: 출근은 attendance_check_in() RPC(SECURITY DEFINER)로만.

grant select, update on public.attendance to authenticated;

-- 3) 쿠폰 (스탬프 카드 완성 보상)
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  label text not null,
  status text not null default 'issued' check (status in ('issued', 'used')),
  issued_at timestamp with time zone default now(),
  used_at timestamp with time zone
);
create index if not exists coupons_profile_idx on public.coupons (profile_id, issued_at desc);
alter table public.coupons enable row level security;

drop policy if exists "coupons_select_own_or_admin" on public.coupons;
create policy "coupons_select_own_or_admin" on public.coupons
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "coupons_admin_update" on public.coupons;
create policy "coupons_admin_update" on public.coupons
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, update on public.coupons to authenticated;

-- 4) 출근 체크인 RPC
create or replace function public.attendance_check_in(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
  v_goal int;
  v_reward text;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_res uuid;
  v_existing uuid;
  v_count int;
  v_coupon boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH', 'message', '로그인이 필요합니다.');
  end if;

  select value into v_token from public.space_settings where key = 'attendance_qr_token';
  if v_token is null or p_token is distinct from v_token then
    return jsonb_build_object('ok', false, 'code', 'TOKEN', 'message', '유효하지 않은 QR입니다.');
  end if;

  select id into v_res
  from public.reservations
  where profile_id = v_uid and status = 'confirmed' and date = v_today
  order by start_time nulls last
  limit 1;
  if v_res is null then
    return jsonb_build_object('ok', false, 'code', 'NO_RESERVATION', 'message', '오늘 확정된 예약이 없어요.');
  end if;

  select id into v_existing
  from public.attendance
  where profile_id = v_uid and (check_in_at at time zone 'Asia/Seoul')::date = v_today
  limit 1;
  if v_existing is not null then
    select count(*) into v_count from public.attendance where profile_id = v_uid;
    return jsonb_build_object('ok', true, 'already', true, 'stamps', v_count, 'message', '오늘은 이미 출근했어요.');
  end if;

  insert into public.attendance (profile_id, reservation_id) values (v_uid, v_res);

  select count(*) into v_count from public.attendance where profile_id = v_uid;
  select coalesce(nullif(value, '')::int, 10) into v_goal from public.space_settings where key = 'attendance_stamp_goal';
  if v_goal is null or v_goal < 1 then v_goal := 10; end if;

  if v_count > 0 and v_count % v_goal = 0 then
    select value into v_reward from public.space_settings where key = 'attendance_reward_label';
    insert into public.coupons (profile_id, label) values (v_uid, coalesce(nullif(v_reward, ''), '보상'));
    v_coupon := true;
  end if;

  return jsonb_build_object('ok', true, 'already', false, 'stamps', v_count, 'goal', v_goal, 'coupon', v_coupon);
end;
$$;

-- 5) 퇴근 체크아웃 RPC
create or replace function public.attendance_check_out()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'message', '로그인이 필요합니다.');
  end if;

  select id into v_id
  from public.attendance
  where profile_id = v_uid
    and check_out_at is null
    and (check_in_at at time zone 'Asia/Seoul')::date = v_today
  order by check_in_at desc
  limit 1;

  if v_id is null then
    return jsonb_build_object('ok', false, 'message', '출근 기록이 없거나 이미 퇴근했어요.');
  end if;

  update public.attendance set check_out_at = now() where id = v_id;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.attendance_check_in(text) to authenticated;
grant execute on function public.attendance_check_out() to authenticated;
