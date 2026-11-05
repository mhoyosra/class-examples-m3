// The customer documents, cut into passages and embedded. The numbers come
// from `npm run build-passages` (lib/copper/data/passages.json). Importing the
// file loads it into memory once, when the app starts, so searching it is fast.
import data from "@/lib/copper/data/passages.json";

export type Passage = {
  id: string;
  documentId: string;
  /** The document's title, which the passage text also starts with. */
  title: string;
  /** 1-based page number in the PDF. */
  page: number;
  text: string;
  embedding: number[];
};

export type PassageFile = {
  model: string;
  dimensions: number;
  passages: Passage[];
};

const file = data as PassageFile;

export const PASSAGES: Passage[] = file.passages;
export const PASSAGE_MODEL = file.model;
