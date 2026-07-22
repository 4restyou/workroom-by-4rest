// Shared options for the 명함첩(directory) + 메모판(board) features.
import type { CardAccent } from "./types";

// Categories used for filtering the directory. `occupation` is a free-text
// field; this list keeps browsing/filtering tidy.
export const CARD_CATEGORIES = [
  "디자인",
  "브랜딩",
  "일러스트 · 웹툰",
  "개발 · IT",
  "사진 · 영상",
  "영상 · 모션",
  "글 · 출판",
  "마케팅 · 기획",
  "콘텐츠 · SNS",
  "공예 · 핸드메이드",
  "음악 · 사운드",
  "패션 · 뷰티",
  "공간 · 건축",
  "푸드 · F&B",
  "교육 · 강의",
  "창업 · 비즈니스",
  "기타",
] as const;

export type CardCategory = (typeof CARD_CATEGORIES)[number];

// Palette is limited to yellow (primary) + sky (secondary). The picker only
// offers these two; legacy values (mint/lilac/coral) still resolve via ACCENT_BG.
export const ACCENTS: CardAccent[] = ["yellow", "sky"];

export const ACCENT_LABEL: Record<CardAccent, string> = {
  yellow: "노랑",
  sky: "하늘",
  gray: "그레이",
  pink: "핑크",
  blue: "하늘",
  mint: "하늘",
  lilac: "하늘",
  coral: "핑크",
};

// Tailwind background per accent. Listed literally so the content scanner keeps
// them. Legacy tints collapse onto the kept two so the directory stays on-palette.
export const ACCENT_BG: Record<CardAccent, string> = {
  yellow: "bg-workroom-yellow",
  sky: "bg-workroom-sky",
  gray: "bg-workroom-gray",
  pink: "bg-workroom-pink",
  blue: "bg-workroom-blue",
  mint: "bg-workroom-sky",
  lilac: "bg-workroom-sky",
  coral: "bg-workroom-pink",
};
