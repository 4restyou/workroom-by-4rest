-- 같은 사람의 계정 두 개를 하나로 합친다.
--
-- 구글로 한 번, 이메일로 한 번 가입하면 계정이 둘이 된다. 예약은 한쪽에 붙어
-- 있는데 다른 쪽으로 로그인하면 "확정 예약이 없다"며 출근이 막힌다(채송하님 사례).
--
-- 두 가지 길:
--   회원이 직접 — 지금 계정에서 "합치기"를 누르고(start), 합칠 계정으로 한 번
--                로그인하면(confirm) 그 계정의 기록이 지금 계정으로 옮겨진다.
--                두 계정 모두에 로그인해 본 사람만 합칠 수 있다. 연락처만 같다고
--                합쳐 주면, 남의 번호를 프로필에 적은 사람이 그 사람의 월권을 가져간다.
--   관리자     — 같은 연락처 계정을 보고 바로 합친다.
--
-- 합쳐진 계정은 지우지 않는다. merged_into에 어디로 갔는지 남기고 새 예약을 막는다
-- (되돌릴 일이 생겨도 추적할 수 있게).

alter table public.profiles add column if not exists merged_into uuid references public.profiles(id) on delete set null;
comment on column public.profiles.merged_into is '다른 계정에 합쳐졌으면 그 계정. 이 계정으로는 새 예약을 만들 수 없다.';

-- ── 실제로 옮기는 함수 (클라이언트가 직접 부를 수 없다) ───────────────
create or replace function public.merge_profile_data(p_from uuid, p_to uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fk record;
  v_moved integer;
  v_total integer := 0;
  v_from public.profiles;
begin
  if p_from is null or p_to is null or p_from = p_to then
    raise exception '합칠 계정이 올바르지 않습니다.';
  end if;
  select * into v_from from public.profiles where id = p_from;
  if not found or not exists (select 1 from public.profiles where id = p_to) then
    raise exception '계정을 찾을 수 없습니다.';
  end if;
  if v_from.role = 'admin' or (select role from public.profiles where id = p_to) = 'admin' then
    raise exception '관리자 계정은 합칠 수 없습니다.';
  end if;

  -- 회원 본인 수정 방지 트리거들을 통과하도록 이 트랜잭션 동안만 서버 권한으로.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- 같은 회원·이용권·날짜·시각의 진행 중 예약이 양쪽에 다 있으면 옮길 때 중복이 된다.
  -- 옮겨 오는 쪽을 취소해 둔다(같은 예약이 둘인 것이므로 하나만 남긴다).
  update public.reservations s
  set status = 'canceled'
  where s.profile_id = p_from
    and s.deleted_at is null
    and s.status in ('pending', 'confirmed')
    and exists (
      select 1 from public.reservations t
      where t.profile_id = p_to and t.deleted_at is null and t.status in ('pending', 'confirmed')
        and t.pass_type = s.pass_type and t.date = s.date
        and t.start_time is not distinct from s.start_time
    );

  -- 명함은 한 사람당 하나. 이미 있으면 옮겨 오는 쪽 명함은 지운다.
  if exists (select 1 from public.member_cards where profile_id = p_to) then
    delete from public.member_cards where profile_id = p_from;
  end if;

  -- profiles를 가리키는 모든 열을 옮긴다. 표가 늘어나도 빠지지 않게 카탈로그에서 찾는다.
  for v_fk in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
      and array_length(c.conkey, 1) = 1
      and c.conrelid <> 'public.profiles'::regclass
      -- 합치기 요청 자체는 기록으로 남긴다(옮기면 남길 계정=합칠 계정이 된다).
      and c.conrelid <> 'public.account_merge_requests'::regclass
  loop
    execute format('update %s set %I = $1 where %I = $2', v_fk.tbl, v_fk.col, v_fk.col)
      using p_to, p_from;
    get diagnostics v_moved = row_count;
    v_total := v_total + v_moved;
  end loop;

  -- 남는 계정에 비어 있는 정보는 옮겨 오는 계정 것으로 채운다.
  update public.profiles t
  set full_name = coalesce(nullif(btrim(t.full_name), ''), v_from.full_name),
      phone = coalesce(nullif(btrim(t.phone), ''), v_from.phone),
      address = coalesce(nullif(btrim(t.address), ''), v_from.address),
      consented_at = coalesce(t.consented_at, v_from.consented_at),
      marketing_consent_at = coalesce(t.marketing_consent_at, v_from.marketing_consent_at),
      admin_note = case
        when coalesce(btrim(v_from.admin_note), '') = '' then t.admin_note
        when coalesce(btrim(t.admin_note), '') = '' then v_from.admin_note
        else t.admin_note || E'\n' || v_from.admin_note
      end
  where t.id = p_to;

  update public.profiles
  set merged_into = p_to,
      blocked_at = coalesce(blocked_at, now()),
      blocked_reason = '다른 계정에 합쳐졌습니다'
  where id = p_from;

  return jsonb_build_object('ok', true, 'moved', v_total);
end;
$$;

revoke all on function public.merge_profile_data(uuid, uuid) from public, anon, authenticated;

-- ── 같은 연락처 찾기 ─────────────────────────────────────────────
create or replace function public.normalized_phone(p text)
returns text
language sql
immutable
as $$ select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '') $$;

create or replace function public.mask_email(p text)
returns text
language sql
immutable
as $$
  select case
    when p is null or position('@' in p) = 0 then null
    else left(split_part(p, '@', 1), 3) || '***@' || split_part(p, '@', 2)
  end
$$;

-- 회원 본인과 연락처가 같은 다른 계정. 이메일은 가려서 돌려준다.
create or replace function public.my_duplicate_accounts()
returns table (id uuid, email_masked text, provider text, reservations integer, last_sign_in_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select o.id,
         public.mask_email(o.email),
         coalesce(u.raw_app_meta_data ->> 'provider', 'email'),
         (select count(*)::int from public.reservations r where r.profile_id = o.id and r.deleted_at is null),
         u.last_sign_in_at
  from public.profiles me
  join public.profiles o
    on o.id <> me.id
   and public.normalized_phone(o.phone) = public.normalized_phone(me.phone)
  left join auth.users u on u.id = o.id
  where me.id = auth.uid()
    and public.normalized_phone(me.phone) is not null
    and me.merged_into is null
    and o.merged_into is null
    and o.role = 'user'
    and me.role = 'user'
$$;

revoke all on function public.my_duplicate_accounts() from public, anon;
grant execute on function public.my_duplicate_accounts() to authenticated;

-- ── 회원이 직접 합치기 ───────────────────────────────────────────
create table if not exists public.account_merge_requests (
  id uuid primary key default gen_random_uuid(),
  keep_id uuid not null references public.profiles(id) on delete cascade,
  absorb_id uuid not null references public.profiles(id) on delete cascade,
  code text not null unique default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  used_at timestamptz
);
alter table public.account_merge_requests enable row level security;
-- 정책 없음: 아래 함수로만 다룬다.

-- 1단계: 지금 로그인한 계정(남길 계정)에서 시작한다.
create or replace function public.start_account_merge(p_other uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', '로그인이 필요합니다.');
  end if;
  if not exists (select 1 from public.my_duplicate_accounts() d where d.id = p_other) then
    return jsonb_build_object('ok', false, 'message', '합칠 수 있는 계정이 아닙니다.');
  end if;

  delete from public.account_merge_requests where keep_id = auth.uid() and used_at is null;
  insert into public.account_merge_requests (keep_id, absorb_id)
  values (auth.uid(), p_other)
  returning code into v_code;

  return jsonb_build_object('ok', true, 'code', v_code);
end;
$$;

revoke all on function public.start_account_merge(uuid) from public, anon;
grant execute on function public.start_account_merge(uuid) to authenticated;

-- 2단계: 합칠 계정으로 로그인해서 확인한다. 이 계정의 기록이 남길 계정으로 옮겨진다.
create or replace function public.confirm_account_merge(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.account_merge_requests;
  v_keep_email text;
  v_result jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH', 'message', '로그인이 필요합니다.');
  end if;

  select * into v_req from public.account_merge_requests where code = p_code for update;
  if not found or v_req.used_at is not null then
    return jsonb_build_object('ok', false, 'code', 'INVALID', 'message', '합치기 요청을 찾을 수 없어요. 처음부터 다시 해 주세요.');
  end if;
  if v_req.expires_at < now() then
    return jsonb_build_object('ok', false, 'code', 'EXPIRED', 'message', '합치기 요청 시간이 지났어요. 처음부터 다시 해 주세요.');
  end if;
  if v_req.keep_id = auth.uid() then
    return jsonb_build_object('ok', false, 'code', 'SAME_ACCOUNT', 'message', '지금은 남길 계정으로 로그인돼 있어요. 합칠 다른 계정으로 로그인해 주세요.');
  end if;
  if v_req.absorb_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'code', 'WRONG_ACCOUNT', 'message', '합치기로 고른 계정이 아니에요. 그 계정으로 로그인해 주세요.');
  end if;

  -- 시작한 뒤에 연락처를 바꿨다면 멈춘다.
  if public.normalized_phone((select phone from public.profiles where id = v_req.keep_id))
     is distinct from public.normalized_phone((select phone from public.profiles where id = v_req.absorb_id)) then
    return jsonb_build_object('ok', false, 'code', 'PHONE', 'message', '두 계정의 연락처가 달라 합칠 수 없어요.');
  end if;

  v_result := public.merge_profile_data(v_req.absorb_id, v_req.keep_id);
  update public.account_merge_requests set used_at = now() where id = v_req.id;
  select public.mask_email(email) into v_keep_email from public.profiles where id = v_req.keep_id;

  return v_result || jsonb_build_object('keep_email', v_keep_email, 'message', '계정을 합쳤어요.');
end;
$$;

revoke all on function public.confirm_account_merge(text) from public, anon;
grant execute on function public.confirm_account_merge(text) to authenticated;

-- ── 관리자가 합치기 ─────────────────────────────────────────────
create or replace function public.admin_merge_profiles(p_from uuid, p_to uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_admin(), false) then
    return jsonb_build_object('ok', false, 'message', '관리자만 합칠 수 있습니다.');
  end if;
  return public.merge_profile_data(p_from, p_to) || jsonb_build_object('message', '계정을 합쳤습니다.');
exception when others then
  return jsonb_build_object('ok', false, 'message', sqlerrm);
end;
$$;

revoke all on function public.admin_merge_profiles(uuid, uuid) from public, anon;
grant execute on function public.admin_merge_profiles(uuid, uuid) to authenticated;
