-- 명함첩(member_cards) + 메모판(board_posts)
-- 명함첩: 회원이 자기소개 명함을 등록하면 방문자가 이름·업종·카테고리로 검색.
-- 메모판: 운영자 공지 + 회원 한마디. 포스트잇 비주얼의 게시판.

-- =====================================================================
-- 1) 명함첩 (member_cards) : 회원 1인당 1장
-- =====================================================================
create table if not exists public.member_cards (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  display_name text not null,
  category text not null default '기타',
  occupation text,
  headline text,
  bio text,
  link_url text,
  instagram text,
  contact text,
  accent text not null default 'yellow' check (accent in ('yellow','mint','lilac','sky','coral')),
  is_published boolean not null default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
create index if not exists member_cards_category_idx on public.member_cards (category);
create index if not exists member_cards_published_idx on public.member_cards (is_published, updated_at desc);
alter table public.member_cards enable row level security;

-- 공개된 명함은 누구나 열람. 본인/운영자는 비공개 명함도 열람.
drop policy if exists "member_cards_public_read" on public.member_cards;
create policy "member_cards_public_read" on public.member_cards
  for select to anon, authenticated
  using (is_published = true or profile_id = auth.uid() or public.is_admin());

-- 본인 명함만 등록.
drop policy if exists "member_cards_insert_own" on public.member_cards;
create policy "member_cards_insert_own" on public.member_cards
  for insert to authenticated
  with check (profile_id = auth.uid());

-- 본인 명함 수정, 운영자는 전부.
drop policy if exists "member_cards_update_own_or_admin" on public.member_cards;
create policy "member_cards_update_own_or_admin" on public.member_cards
  for update to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

-- 본인 명함 삭제, 운영자는 전부.
drop policy if exists "member_cards_delete_own_or_admin" on public.member_cards;
create policy "member_cards_delete_own_or_admin" on public.member_cards
  for delete to authenticated
  using (profile_id = auth.uid() or public.is_admin());

grant select on public.member_cards to anon, authenticated;
grant insert, update, delete on public.member_cards to authenticated;

-- =====================================================================
-- 2) 메모판 (board_posts) : 공지(notice) + 한마디(message)
-- =====================================================================
create table if not exists public.board_posts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  author_name text not null,
  kind text not null default 'message' check (kind in ('notice', 'message')),
  body text not null,
  color text not null default 'yellow' check (color in ('yellow','mint','lilac','sky','coral')),
  is_pinned boolean not null default false,
  is_hidden boolean not null default false,
  created_at timestamp with time zone default now()
);
create index if not exists board_posts_feed_idx on public.board_posts (is_hidden, is_pinned desc, created_at desc);
alter table public.board_posts enable row level security;

-- 숨김 처리되지 않은 글은 누구나 열람(운영자는 전부).
drop policy if exists "board_posts_public_read" on public.board_posts;
create policy "board_posts_public_read" on public.board_posts
  for select to anon, authenticated
  using (is_hidden = false or public.is_admin());

-- 회원은 본인 명의의 한마디(message)만, 운영자는 공지(notice)도 작성.
drop policy if exists "board_posts_insert" on public.board_posts;
create policy "board_posts_insert" on public.board_posts
  for insert to authenticated
  with check (
    public.is_admin()
    or (kind = 'message' and profile_id = auth.uid())
  );

-- 본인 글 수정, 운영자는 전부(공지/고정/숨김 처리 포함).
drop policy if exists "board_posts_update_own_or_admin" on public.board_posts;
create policy "board_posts_update_own_or_admin" on public.board_posts
  for update to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

-- 본인 글 삭제, 운영자는 전부.
drop policy if exists "board_posts_delete_own_or_admin" on public.board_posts;
create policy "board_posts_delete_own_or_admin" on public.board_posts
  for delete to authenticated
  using (profile_id = auth.uid() or public.is_admin());

grant select on public.board_posts to anon, authenticated;
grant insert, update, delete on public.board_posts to authenticated;
