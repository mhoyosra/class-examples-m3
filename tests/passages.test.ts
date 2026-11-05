// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DOCUMENTS } from "@/lib/copper/documents";
import { PASSAGES } from "@/lib/copper/passages";
import { splitPage } from "@/lib/copper/split";

describe("splitPage", () => {
  const page = "One is here. Two is here. Three is here. Four is here. Five.";

  it("makes passages of three sentences, each starting with the title", () => {
    const [first] = splitPage("My Guide", page);
    expect(first).toBe("My Guide\n\nOne is here. Two is here. Three is here.");
  });

  it("joins a leftover single sentence to the passage before it", () => {
    const passages = splitPage("My Guide", "A one. B two. C three. D four.");
    expect(passages).toHaveLength(1);
    expect(passages[0]).toContain("D four.");
  });

  it("returns nothing for a blank page", () => {
    expect(splitPage("My Guide", "  \n ")).toEqual([]);
  });
});

describe("PASSAGES", () => {
  it("has passages from every document", () => {
    for (const doc of DOCUMENTS) {
      expect(PASSAGES.some((p) => p.documentId === doc.id)).toBe(true);
    }
  });

  it("keeps the title and page with each passage and starts the text with the title", () => {
    for (const p of PASSAGES) {
      expect(p.page).toBeGreaterThanOrEqual(1);
      expect(p.text.startsWith(`${p.title}\n\n`)).toBe(true);
    }
  });

  it("gives every passage an embedding of the same length", () => {
    const sizes = new Set(PASSAGES.map((p) => p.embedding.length));
    expect(sizes.size).toBe(1);
    expect([...sizes][0]).toBeGreaterThan(0);
  });

  it("has unique ids", () => {
    expect(new Set(PASSAGES.map((p) => p.id)).size).toBe(PASSAGES.length);
  });
});
