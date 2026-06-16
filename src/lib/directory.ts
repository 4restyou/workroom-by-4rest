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

export const ACCENTS: CardAccent[] = ["yellow", "mint", "lilac", "sky", "coral"];

export const ACCENT_LABEL: Record<CardAccent, string> = {
  yellow: "노랑",
  mint: "민트",
  lilac: "라일락",
  sky: "하늘",
  coral: "코랄",
};

// Tailwind background per accent. Listed literally so the content scanner keeps
// them (mirrors lib/ui tint usage).
export const ACCENT_BG: Record<CardAccent, string> = {
  yellow: "bg-workroom-yellow",
  mint: "bg-workroom-mint",
  lilac: "bg-workroom-lilac",
  sky: "bg-workroom-sky",
  coral: "bg-workroom-coral",
};
