-- 메모판 메모지 색상 확장: 노랑·그레이·핑크·하늘(blue).
-- 기존 값(yellow/mint/lilac/sky/coral)은 그대로 유효(과거 데이터 보존).

alter table public.board_posts drop constraint if exists board_posts_color_check;
alter table public.board_posts add constraint board_posts_color_check
  check (color in ('yellow', 'mint', 'lilac', 'sky', 'coral', 'gray', 'pink', 'blue'));
