-- 회원 단체 문자 — 대상 선정과 발송 이력.
--
-- 대상을 고르는 규칙이 이 기능의 핵심이다. 광고성 정보(할인·이벤트)는
-- 정보통신망법 제50조에 따라 사전 동의가 필요하고, 예외는 하나뿐이다:
-- 거래로 직접 받은 연락처로 거래 종료 후 6개월 이내에 같은 종류의 상품을
-- 광고하는 경우. 그래서 '최근 6개월 이용자'가 별도 대상으로 있다.
--
-- 대상 목록은 서버가 만든다. 화면이 번호를 모아서 보내는 구조라면 화면 코드를
-- 고치는 것만으로 누구에게나 광고를 보낼 수 있게 된다.

alter table public.profiles
  add column if not exists marketing_consent_at timestamptz;

comment on column public.profiles.marketing_consent_at is
  '광고 수신에 동의한 시각. 회원이 직접 켜고 끈다. 없으면 동의하지 않은 것.';

create table if not exists public.sms_campaigns (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('notice', 'ad')),
  audience text not null,
  body text not null,
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.sms_campaigns is '단체 문자 발송 이력. 누구에게 무엇을 보냈는지 남긴다.';

create index if not exists sms_campaigns_created_idx on public.sms_campaigns (created_at desc);

alter table public.sms_campaigns enable row level security;

drop policy if exists "sms_campaigns_admin_all" on public.sms_campaigns;
create policy "sms_campaigns_admin_all" on public.sms_campaigns
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert on public.sms_campaigns to authenticated;

-- 대상 회원. 관리자와 service_role 만 부를 수 있다.
create or replace function public.broadcast_audience(p_audience text)
returns table (id uuid, full_name text, phone text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if not (public.is_admin() or auth.role() = 'service_role') then
    raise exception '관리자만 조회할 수 있습니다.';
  end if;

  return query
  select p.id, p.full_name, p.phone
  from public.profiles p
  where p.role = 'user'
    and p.blocked_at is null
    and coalesce(btrim(p.phone), '') <> ''
    and case p_audience
      -- 오늘 유효한 이용권이 있는 회원.
      when 'active' then exists (
        select 1 from public.reservations r
        where r.profile_id = p.id and r.status = 'confirmed' and r.deleted_at is null
          and (
            (r.access_start_date is null and r.date = v_today)
            or (r.access_start_date is not null and v_today between r.access_start_date and r.access_end_date)
          )
      )
      -- 앞으로 예약이 잡혀 있는 회원.
      when 'upcoming' then exists (
        select 1 from public.reservations r
        where r.profile_id = p.id and r.deleted_at is null
          and r.status in ('pending', 'confirmed')
          and coalesce(r.access_end_date, r.date) >= v_today
      )
      -- 최근 6개월 안에 이용한 회원. 광고 동의 예외가 닿는 범위다.
      when 'recent6m' then exists (
        select 1 from public.reservations r
        where r.profile_id = p.id and r.deleted_at is null
          and r.status in ('confirmed', 'completed')
          and coalesce(r.access_end_date, r.date) >= v_today - 180
          and coalesce(r.access_start_date, r.date) <= v_today
      )
      when 'consented' then p.marketing_consent_at is not null
      when 'all' then true
      else false
    end;
end;
$$;

revoke all on function public.broadcast_audience(text) from public, anon;
grant execute on function public.broadcast_audience(text) to authenticated, service_role;
