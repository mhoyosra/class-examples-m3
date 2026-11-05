// search_docs, the Ask Copper tool that answers from the customer documents.
// Most checks use a fake embedding call, so they need no AI key and cost
// nothing. The last group runs the three sample questions against Google, and
// only when a key is set.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLive, type Live } from "@/lib/ai/live";
import type { Progress } from "@/lib/copper/assistant/progress";
import { DOCUMENTS } from "@/lib/copper/documents";
import { PASSAGES, type Passage } from "@/lib/copper/passages";
import {
  closestPassages,
  codesIn,
  cosineSimilarity,
  pdfLink,
  RESULT_COUNT,
} from "@/lib/copper/search";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.doUnmock("@/lib/ai/call");
  vi.doUnmock("@/lib/copper/assistant/ask");
  vi.resetModules();
});

describe("finding the closest passages", () => {
  const passage = (id: string, embedding: number[], page = 1): Passage => ({
    id,
    documentId: "copper-plus-faq",
    title: "Copper Plus FAQ",
    page,
    text: `Copper Plus FAQ\n\nText of ${id}.`,
    embedding,
  });

  it("scores 1 for the same direction, 0 for unrelated and handles empty vectors", () => {
    expect(cosineSimilarity([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it("returns the 5 closest passages, best first, each with title, page, link and no repeated title in the text", () => {
    const passages = [
      passage("far", [0, 1], 6),
      passage("near", [1, 0.1], 2),
      passage("middle", [1, 1], 3),
      passage("a", [1, 0.3], 4),
      passage("b", [1, 0.5], 5),
      passage("c", [1, 0.7], 1),
    ];
    const results = closestPassages([1, 0], passages);
    expect(results).toHaveLength(RESULT_COUNT);
    expect(results.map((r) => r.page)).toEqual([2, 4, 5, 1, 3]);
    expect(results[0]).toMatchObject({
      title: "Copper Plus FAQ",
      page: 2,
      text: "Text of near.",
      url: "/docs/copper-plus-faq.pdf#page=2",
    });
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("finds codes like C-31 in a question, ignoring case and repeats", () => {
    expect(
      codesIn('What does "c-31" mean? C-31 on Copper Notes, and C-12?'),
    ).toEqual(["C-31", "C-12"]);
    expect(codesIn("annual refund")).toEqual([]);
  });

  it("puts the passage with the exact code first even when another is closer in meaning", () => {
    const withCode: Passage = {
      id: "code",
      documentId: "copper-notes-user-guide",
      title: "Copper Notes User Guide",
      page: 8,
      text: "Copper Notes User Guide\n\nC-31 Storage full: recordings haven't been uploaded yet.",
      embedding: [1, 1],
    };
    const lookalike: Passage = {
      ...withCode,
      id: "other",
      page: 4,
      text: "Copper Notes User Guide\n\nError C-312 or C-3 means something else.",
      embedding: [1, 0.5],
    };
    const results = closestPassages(
      [1, 0],
      [lookalike, withCode],
      5,
      'What does "C-31" mean on Copper Notes?',
    );
    expect(results.map((r) => r.page)).toEqual([8, 4]);
    // Without the code in the question, meaning alone decides.
    expect(
      closestPassages([1, 0], [lookalike, withCode], 5, "storage").map(
        (r) => r.page,
      ),
    ).toEqual([4, 8]);
  });

  it("links to the PDF at the right page", () => {
    for (const doc of DOCUMENTS) {
      expect(pdfLink(doc.id, 7)).toBe(`${doc.file}#page=7`);
    }
  });
});

describe("the search_docs tool", () => {
  it("embeds the question as a query and returns the 5 closest passages", async () => {
    const target = PASSAGES[10];
    const callEmbed = vi.fn().mockResolvedValue({
      embeddings: [target.embedding],
    });
    vi.doMock("@/lib/ai/call", () => ({ callEmbed }));
    const { copperTools } = await import("@/lib/copper/assistant/tools");

    expect(copperTools.search_docs.description).toMatch(
      /setup|troubleshooting|warranty/i,
    );
    const output = (await copperTools.search_docs.execute!(
      { question: "annual refund" },
      { toolCallId: "t", messages: [] } as never,
    )) as { question: string; results: ReturnType<typeof closestPassages> };

    expect(callEmbed).toHaveBeenCalledWith(
      expect.objectContaining({ module: 3, feature: "search-docs" }),
      { values: ["annual refund"], task: "query" },
    );
    expect(output.question).toBe("annual refund");
    expect(output.results).toHaveLength(5);
    expect(output.results[0]).toMatchObject({
      documentId: target.documentId,
      page: target.page,
    });
    for (const r of output.results) {
      expect(r.title).toBeTruthy();
      expect(r.url).toMatch(/^\/docs\/.+\.pdf#page=\d+$/);
    }
  });

  it("tells Copper to use it for setup, troubleshooting, warranty and policy questions", async () => {
    const { COPPER_INSTRUCTIONS } =
      await import("@/lib/copper/assistant/instructions");
    expect(COPPER_INSTRUCTIONS).toContain("search_docs");
    for (const topic of ["setup", "troubleshooting", "warranty", "policy"]) {
      expect(COPPER_INSTRUCTIONS).toContain(topic);
    }
  });
});

describe("the search_docs tool card", () => {
  it("lists each passage with its title, page and a link that opens the PDF at that page", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "AIza-test-key");
    const results = [
      ["copper-home-user-guide", "Copper Home User Guide", 9],
      ["copper-plus-faq", "Copper Plus FAQ", 5],
      [
        "copper-terms-and-conditions",
        "Copper State Labs Terms and Conditions",
        4,
      ],
      ["copper-notes-user-guide", "Copper Notes User Guide", 4],
      ["copper-home-user-guide", "Copper Home User Guide", 4],
    ].map(([documentId, title, page], i) => ({
      documentId,
      title,
      page,
      text: `Passage ${i + 1} text.`,
      score: 0.6 - i / 100,
      url: pdfLink(documentId as string, page as number),
    }));
    const done = createLive<Progress>();
    done.done({
      steps: [
        {
          type: "tool",
          id: "call-1",
          name: "search_docs",
          state: "done",
          input: { question: "C-47" },
          output: { question: "C-47", results },
        },
      ],
      reply: "C-47 is a microphone array fault.",
      status: "done",
    });
    const askCopper = vi
      .fn()
      .mockResolvedValue({ progress: done.live as Live<Progress> });
    vi.doMock("@/lib/copper/assistant/ask", () => ({ askCopper }));

    vi.resetModules();
    const { default: Home } = await import("@/app/page");
    const page = Home as unknown as () => Promise<React.ReactNode>;
    render(<>{await page()}</>);
    fireEvent.click(screen.getByTestId("ask-copper-launcher"));
    const chat = within(await screen.findByTestId("ask-copper"));
    fireEvent.change(chat.getByRole("textbox"), { target: { value: "C-47" } });
    fireEvent.click(chat.getByRole("button", { name: /send/i }));

    const card = within(await screen.findByTestId("tool-call"));
    await waitFor(() =>
      expect(card.getByTestId("doc-results")).toBeInTheDocument(),
    );
    expect(card.getAllByText(/search_docs/).length).toBeGreaterThan(0);
    expect(card.getAllByText("Copper Home User Guide")).toHaveLength(2);
    expect(card.getByText("Copper Plus FAQ")).toBeVisible();
    const links = card.getAllByRole("link");
    expect(links).toHaveLength(5);
    expect(links[0]).toHaveAttribute(
      "href",
      "/docs/copper-home-user-guide.pdf#page=9",
    );
    expect(links[0]).toHaveTextContent("Open page 9");
    expect(links[2]).toHaveAttribute(
      "href",
      "/docs/copper-terms-and-conditions.pdf#page=4",
    );
  });
});

describe("Copper's rules for answering from the documents", () => {
  it("answers only from search_docs, cites every sentence in one format, and has an exact 'not found' line", async () => {
    const { COPPER_INSTRUCTIONS: rules } =
      await import("@/lib/copper/assistant/instructions");
    expect(rules).toMatch(/ONLY from the passages search_docs returns/);
    expect(rules).toMatch(/never guess/i);
    expect(rules).toMatch(/Cite every sentence/);
    expect(rules).toContain("[Copper Home User Guide, p. 9]");
    expect(rules).toContain('"I couldn\'t find that in our support docs."');
    expect(rules).toContain("Copper Crew");
  });

  it("searches the docs for any question about a Copper product, and says 'can't help' only when it has nothing to do with Copper", async () => {
    const { COPPER_INSTRUCTIONS: rules } =
      await import("@/lib/copper/assistant/instructions");
    expect(rules).toContain("Can Copper Home order me a pizza?");
    expect(rules).toMatch(/nothing to do with Copper at all/);
    expect(rules).toMatch(/never "off topic"/);
  });
});

describe("citations in Copper's reply", () => {
  async function chatWithReply(reply: string) {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "AIza-test-key");
    const done = createLive<Progress>();
    done.done({ steps: [], reply, status: "done" });
    vi.doMock("@/lib/copper/assistant/ask", () => ({
      askCopper: vi.fn().mockResolvedValue({ progress: done.live }),
    }));
    vi.resetModules();
    const { default: Home } = await import("@/app/page");
    const page = Home as unknown as () => Promise<React.ReactNode>;
    render(<>{await page()}</>);
    fireEvent.click(screen.getByTestId("ask-copper-launcher"));
    const chat = within(await screen.findByTestId("ask-copper"));
    fireEvent.change(chat.getByRole("textbox"), { target: { value: "Hi" } });
    fireEvent.click(chat.getByRole("button", { name: /send/i }));
    return chat;
  }

  it("each [Title, p. N] becomes a link that opens that PDF at that page", async () => {
    const chat = await chatWithReply(
      "Unplug it for 30 seconds [Copper Home User Guide, p. 9]. Refunds take 14 days [Copper Plus FAQ, p. 5][Copper State Labs Terms and Conditions, p. 4].",
    );
    const links = await chat.findAllByTestId("citation");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/docs/copper-home-user-guide.pdf#page=9",
      "/docs/copper-plus-faq.pdf#page=5",
      "/docs/copper-terms-and-conditions.pdf#page=4",
    ]);
    expect(links[0]).toHaveTextContent("[Copper Home User Guide, p. 9]");
  });

  it("leaves a citation to a document that doesn't exist as plain text", async () => {
    const chat = await chatWithReply("Made up [Secret Manual, p. 3].");
    await chat.findByText(/Made up \[Secret Manual, p\. 3\]\./);
    expect(chat.queryAllByTestId("citation")).toHaveLength(0);
  });
});

// A real call to Google, only when a key is set.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const live = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

describe.skipIf(!live)(
  "search_docs on the real documents (live Google key)",
  () => {
    async function top(question: string) {
      const { searchDocs } = await import("@/lib/copper/search");
      const { results } = await searchDocs(question);
      expect(results).toHaveLength(5);
      return results;
    }

    it("C-47 finds the error code in the Copper Home guide first", async () => {
      const [first] = await top("C-47");
      expect(first.documentId).toBe("copper-home-user-guide");
      expect(first.text).toContain("C-47");
    }, 60_000);

    it('"What does "C-31" mean on Copper Notes?" finds page 8 of the Copper Notes guide', async () => {
      const results = await top('What does "C-31" mean on Copper Notes?');
      // Page 8's error table is in the 5 results, with the exact code.
      expect(
        results.some(
          (r) =>
            r.documentId === "copper-notes-user-guide" &&
            r.page === 8 &&
            r.text.includes("C-31 Storage full"),
        ),
      ).toBe(true);
      // Every result that has the code ranks above those that don't.
      const hasCode = results.map((r) => r.text.includes("C-31"));
      expect(hasCode.slice(0, 2)).toEqual([true, true]);
    }, 60_000);

    it("annual refund finds the refund rules", async () => {
      const results = await top("annual refund");
      expect(results[0].text.toLowerCase()).toContain("refund");
      expect(
        results.some((r) =>
          ["copper-plus-faq", "copper-terms-and-conditions"].includes(
            r.documentId,
          ),
        ),
      ).toBe(true);
    }, 60_000);

    it("reset Wi-Fi finds the Wi-Fi steps in a user guide", async () => {
      const [first] = await top("reset Wi-Fi");
      expect(first.documentId).toMatch(/user-guide$/);
      expect(first.text).toMatch(/wi-?fi/i);
    }, 60_000);
  },
);
