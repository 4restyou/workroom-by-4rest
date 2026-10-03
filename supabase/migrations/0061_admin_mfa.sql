-- 관리자 2단계 인증(TOTP).
--
-- 관리자 계정 비밀번호 하나가 새면 회원 연락처·결제·환불·단체 문자까지 전부
-- 열린다. 인증 앱(구글 OTP 등)을 등록한 관리자는 그 코드까지 입력한 세션
-- (JWT aal = 'aal2')에서만 관리자로 인정한다.
--
-- 아직 인증 앱을 등록하지 않은 관리자는 지금처럼 동작한다. 그래야 배포
-- 직후 유일한 관리자가 잠기지 않는다. 등록은 관리자 화면 > 설정 > 보안에서.
--
-- 휴대폰을 잃어버렸을 때(관리자 본인이 SQL 편집기에서):
--   delete from auth.mfa_factors
--   where user_id = (select id from auth.users where email = '관리자이메일');

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and (
        coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
        or not exists (
          select 1
          from auth.mfa_factors f
          where f.user_id = p.id
            and f.status = 'verified'
        )
      )
  );
$$;
