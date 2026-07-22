-- 메모판 답글(이어붙이는 메모): board_posts 자기참조.
-- 답글도 일반 메모와 같은 RLS·가드(트리거)를 그대로 탄다.
-- 원 메모가 삭제되면 붙어 있던 답글도 함께 삭제(cascade).

alter table public.board_posts
  add column if not exists parent_id uuid references public.board_posts(id) on delete cascade;

create index if not exists board_posts_parent_idx
  on public.board_posts (parent_id, created_at);
