import { describe, expect, it } from "vitest";
import { badge, buttonClass, card, tintCard } from "./ui";

describe("buttonClass", () => {
  it("includes the shared base, variant and size", () => {
    const cls = buttonClass("accent", "lg", "w-full");
    expect(cls).toContain("rounded-[6px]");
    expect(cls).toContain("bg-workroom-yellow");
    expect(cls).toContain("text-base sm:text-lg");
    expect(cls).toContain("w-full");
  });

  it("defaults to primary / md", () => {
    const cls = buttonClass();
    expect(cls).toContain("bg-workroom-ink");
  });
});

describe("tintCard / badge", () => {
  it("maps a tint colour to its background", () => {
    expect(tintCard("yellow")).toContain("bg-workroom-yellow");
    expect(tintCard("ink")).toContain("bg-workroom-ink");
    expect(tintCard("ink")).toContain("text-white");
  });

  it("collapses legacy tints onto the limited palette (yellow + sky)", () => {
    expect(tintCard("mint")).toContain("bg-workroom-sky");
    expect(tintCard("lilac")).toContain("bg-workroom-sky");
    expect(tintCard("coral")).toContain("bg-workroom-yellow");
  });

  it("renders a badge with a quiet outline", () => {
    expect(badge("yellow")).toContain("border border-workroom-line");
    expect(badge("yellow")).toContain("bg-workroom-yellow");
  });
});

describe("card", () => {
  it("is a quiet outline surface with no drop shadow", () => {
    expect(card).toContain("border border-workroom-line");
    expect(card).not.toContain("shadow-hard");
  });
});
