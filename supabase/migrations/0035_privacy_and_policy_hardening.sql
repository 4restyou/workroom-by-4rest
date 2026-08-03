-- 0035: 명함첩 개인정보 노출 축소 + RLS 정책 이중 방어 + 결제 로그 기본 provider 정정.
--
-- 배경
--   1) member_cards는 `is_published` 기본값이 true였고 anon에게 전체 컬럼이
--      공개돼, 회원이 별도 조작을 하지 않아도 연락처가 로그인 없이(=검색엔진
--      포함) 노출될 수 있었다. 노출 기본값을 opt-out에서 opt-in으로 바꾸고,
--      연락처 컬럼은 비로그인 사용자에게서 잘라낸다.
--   2) 회원이 공지를 위조하거나 남의 명함을 가로채는 것을 지금은 트리거
--      (guard_board_post_member_write / guard_member_card_write)만 막고 있다.
--      정책만 읽으면 허용처럼 보이고, 트리거가 유실되면 그대로 뚫린다.
--      같은 조건을 RLS 정책의 with check에도 중복해 이중 방어한다.
--   3) reservation_payment_logs.provider 기본값이 'toss'로 남아 있었다.
--      Toss 연동은 제거됐으므로 기본값을 실제 PG인 'portone'으로 맞춘다.

-- =====================================================================
-- 1) 명함첩: 공개는 opt-in, 연락처는 로그인 사용자에게만
-- =====================================================================

-- 신규 명함은 기본 비공개. 기존 행은 회원이 의도적으로 공개했을 수 있으므로
-- 건드리지 않는다 (대신 연락처는 아래 컬럼 권한으로 즉시 가려진다).
alter table public.member_cards alter column is_published set default false;

-- 컬럼 레벨 권한: anon은 contact를 제외한 컬럼만 조회할 수 있다.
-- (RLS는 행 단위라 컬럼을 가릴 수 없어 GRANT로 처리한다.)
revoke select on public.member_cards from anon;
grant select (
  id,
  profile_id,
  display_name,
  category,
  occupation,
  company,
  headline,
  bio,
  link_url,
  instagram,
  accent,
  is_published,
  created_at,
  updated_at
) on public.member_cards to anon;

-- 로그인 회원은 연락처를 포함해 전체를 볼 수 있다 (기존과 동일).
grant select on public.member_cards to authenticated;

-- 본인 명함 수정 시 소유자를 바꿔치기할 수 없도록 정책에도 못 박는다.
drop policy if exists "member_cards_update_own_or_admin" on public.member_cards;
create policy "member_cards_update_own_or_admin" on public.member_cards
  for update to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (
    public.is_admin()
    or profile_id = auth.uid()
  );

-- =====================================================================
-- 2) 메모판: 회원은 '한마디'만, 고정·숨김은 운영자만
-- =====================================================================
-- guard_board_post_member_write 트리거가 값을 강제로 되돌리지만, 정책 자체도
-- 같은 경계를 갖게 해 트리거가 사라져도 공지 위조가 불가능하게 한다.

drop policy if exists "board_posts_insert" on public.board_posts;
create policy "board_posts_insert" on public.board_posts
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      kind = 'message'
      and profile_id = auth.uid()
      and is_pinned = false
      and is_hidden = false
    )
  );

drop policy if exists "board_posts_update_own_or_admin" on public.board_posts;
create policy "board_posts_update_own_or_admin" on public.board_posts
  for update to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (
    public.is_admin()
    or (
      profile_id = auth.uid()
      and kind = 'message'
      and is_pinned = false
      and is_hidden = false
    )
  );

-- =====================================================================
-- 3) 결제 로그 기본 provider 정정
-- =====================================================================
-- 엣지 함수는 항상 provider를 명시하므로 기본값은 누락 시 대비용이다.
-- Toss 연동(confirm-payment / Toss 환불)은 제거됐다.
alter table public.reservation_payment_logs alter column provider set default 'portone';
