// Cuts one page of a document into passages of a few sentences each. A
// passage is small enough to be about one thing, which is what makes it
// useful to search. Each passage starts with the document title, so the title's
// words are part of what gets embedded.

export const SENTENCES_PER_PASSAGE = 3;

function sentencesOf(pageText: string): string[] {
  const clean = pageText.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  return Array.from(segmenter.segment(clean), (s) => s.segment.trim()).filter(
    Boolean,
  );
}

/**
 * Groups a page's sentences into passages of SENTENCES_PER_PASSAGE sentences.
 * A leftover single sentence joins the passage before it instead of standing
 * alone. Passages never run across a page break, so each has one page number.
 */
export function splitPage(
  documentTitle: string,
  pageText: string,
  perPassage = SENTENCES_PER_PASSAGE,
): string[] {
  const sentences = sentencesOf(pageText);
  const groups: string[][] = [];
  for (let i = 0; i < sentences.length; i += perPassage) {
    groups.push(sentences.slice(i, i + perPassage));
  }
  if (groups.length > 1 && groups[groups.length - 1].length === 1) {
    const last = groups.pop() as string[];
    groups[groups.length - 1].push(...last);
  }
  return groups.map((g) => `${documentTitle}\n\n${g.join(" ")}`);
}
