-- 회원 차단.
--
-- 광고 목적으로 가입한 계정, 반복 노쇼처럼 더 받지 않기로 한 회원을 관리자가
-- 막을 수 있어야 한다. 지금은 회원 목록에서 메모만 남길 수 있어, 같은 사람이
-- 계속 예약을 넣어도 손으로 하나씩 취소하는 수밖에 없다.
--
-- 삭제가 아니라 차단이다. 이미 다녀간 사람의 계정을 지우면 그 사람의 결제·
-- 방문 기록이 주인을 잃는다. 차단은 새 예약만 막고 기록은 그대로 둔다.
-- (기록이 아예 없는 광고 계정은 관리자 화면에서 삭제할 수 있다.)

alter table public.profiles
  add column if not exists blocked_at timestamptz,
  add column if not exists blocked_reason text;

comment on column public.profiles.blocked_at is '차단한 시각. 값이 있으면 새 예약을 만들 수 없다.';
comment on column public.profiles.blocked_reason is '차단 사유(관리자만 본다).';

create index if not exists profiles_blocked_idx on public.profiles (blocked_at) where blocked_at is not null;

-- 차단된 회원은 새 예약을 만들 수 없다. 화면에서 버튼을 숨기는 것만으로는
-- 부족하다 — API는 그대로 열려 있고, 광고 계정은 화면을 거치지 않는다.
create or replace function public.reject_blocked_member_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 관리자가 대신 넣어 주는 예약은 막지 않는다(현장에서 받기로 한 경우).
  if public.is_admin() or auth.role() = 'service_role' then
    return new;
  end if;

  if new.profile_id is not null and exists (
    select 1 from public.profiles p where p.id = new.profile_id and p.blocked_at is not null
  ) then
    raise exception '예약이 제한된 계정입니다. 운영자에게 문의해 주세요.';
  end if;

  return new;
end;
$$;

drop trigger if exists aa_reject_blocked_member on public.reservations;
create trigger aa_reject_blocked_member
  before insert on public.reservations
  for each row execute function public.reject_blocked_member_booking();

-- 회원은 자기 프로필 행을 수정할 수 있다(이름·연락처). 보호 목록에 넣지 않으면
-- 차단당한 사람이 자기 blocked_at 을 지우는 것도 '프로필 수정'이다.
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
  new.blocked_at = old.blocked_at;
  new.blocked_reason = old.blocked_reason;
  return new;
end;
$$;

-- 차단·해제는 관리자만. 회원이 스스로 blocked_at 을 지우지 못하도록 컬럼을
-- 직접 쓰지 않고 이 함수로만 바꾼다(0018의 프로필 보호 트리거와 같은 방식).
create or replace function public.admin_set_member_blocked(
  p_profile_id uuid,
  p_blocked boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', '관리자만 변경할 수 있습니다.');
  end if;
  if p_profile_id is null then
    return jsonb_build_object('ok', false, 'message', '회원을 선택해 주세요.');
  end if;
  if p_profile_id = auth.uid() then
    return jsonb_build_object('ok', false, 'message', '본인 계정은 차단할 수 없습니다.');
  end if;

  select full_name into v_name from public.profiles where id = p_profile_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', '존재하지 않는 회원입니다.');
  end if;

  update public.profiles
  set blocked_at = case when p_blocked then now() else null end,
      blocked_reason = case when p_blocked then nullif(btrim(p_reason), '') else null end
  where id = p_profile_id;

  return jsonb_build_object(
    'ok', true,
    'blocked', p_blocked,
    'message', case when p_blocked then '예약을 제한했습니다.' else '제한을 해제했습니다.' end
  );
end;
$$;

revoke all on function public.admin_set_member_blocked(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_member_blocked(uuid, boolean, text) to authenticated;
