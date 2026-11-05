// Searching the customer documents by meaning. The question is turned into an
// embedding (a list of numbers), and the passages whose embeddings point the
// same way are the closest matches. "Pointing the same way" is cosine
// similarity: 1 means the same direction, 0 means unrelated.
import { callEmbed } from "@/lib/ai/call";
import { DOCUMENTS } from "@/lib/copper/documents";
import { PASSAGES, type Passage } from "@/lib/copper/passages";

export const RESULT_COUNT = 5;

export type DocResult = {
  documentId: string;
  title: string;
  page: number;
  /** The passage, without the document title it starts with. */
  text: string;
  /** Cosine similarity to the question, 0 to 1 (higher is closer). */
  score: number;
  /** Opens the PDF at that page. */
  url: string;
};

export type DocSearch = { question: string; results: DocResult[] };

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

/** The link that opens a document's PDF at one page (browsers read #page=N). */
export function pdfLink(documentId: string, page: number): string {
  const doc = DOCUMENTS.find((d) => d.id === documentId);
  return `${doc?.file ?? `/docs/${documentId}.pdf`}#page=${page}`;
}

function toResult(passage: Passage, score: number): DocResult {
  return {
    documentId: passage.documentId,
    title: passage.title,
    page: passage.page,
    text: passage.text.startsWith(`${passage.title}\n\n`)
      ? passage.text.slice(passage.title.length + 2)
      : passage.text,
    score: Math.round(score * 1000) / 1000,
    url: pdfLink(passage.documentId, passage.page),
  };
}

/** The `count` passages closest in meaning to an already-embedded question. */
export function closestPassages(
  questionEmbedding: number[],
  passages: Passage[] = PASSAGES,
  count = RESULT_COUNT,
): DocResult[] {
  return passages
    .map((p) => ({ p, score: cosineSimilarity(questionEmbedding, p.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(({ p, score }) => toResult(p, score));
}

/** search_docs: embeds the question and returns the 5 closest passages. */
export async function searchDocs(question: string): Promise<DocSearch> {
  const { embeddings } = await callEmbed(
    { module: 3, feature: "search-docs" },
    { values: [question], task: "query" },
  );
  return { question, results: closestPassages(embeddings[0]) };
}
