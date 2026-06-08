import { describe, expect, it } from "vitest";
import { badge, buttonClass, card, tintCard } from "./ui";

describe("buttonClass", () => {
  it("includes the shared base, variant and size", () => {
    const cls = buttonClass("accent", "lg", "w-full");
    expect(cls).toContain("rounded-pill");
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
    expect(tintCard("mint")).toContain("bg-workroom-mint");
    expect(tintCard("ink")).toContain("bg-workroom-ink");
    expect(tintCard("ink")).toContain("text-white");
  });

  it("renders a badge with an ink border", () => {
    expect(badge("yellow")).toContain("border-2 border-workroom-ink");
    expect(badge("yellow")).toContain("bg-workroom-yellow");
  });
});

describe("card", () => {
  it("is an outline surface with an ink border and no drop shadow", () => {
    expect(card).toContain("border-2 border-workroom-ink");
    expect(card).not.toContain("shadow-hard");
  });
});
