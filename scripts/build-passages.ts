// npm run build-passages: reads every PDF in public/docs/, cuts each page into
// passages, embeds them with Gemini and saves them all to
// lib/copper/data/passages.json, which the app loads into memory at startup.
// Run it again whenever a PDF changes.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { callEmbed } from "@/lib/ai/call";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@/lib/ai/models";
import { DOCUMENTS } from "@/lib/copper/documents";
import type { Passage, PassageFile } from "@/lib/copper/passages";
import { splitPage } from "@/lib/copper/split";

const BATCH = 90;
const OUT = path.join("lib", "copper", "data", "passages.json");

async function main() {
  const passages: Omit<Passage, "embedding">[] = [];

  for (const doc of DOCUMENTS) {
    const bytes = await readFile(path.join("public", doc.file));
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text: pages } = await extractText(pdf, { mergePages: false });
    pages.forEach((pageText, i) => {
      splitPage(doc.title, pageText).forEach((text, n) => {
        passages.push({
          id: `${doc.id}-p${i + 1}-${n + 1}`,
          documentId: doc.id,
          title: doc.title,
          page: i + 1,
          text,
        });
      });
    });
  }

  console.log(`Embedding ${passages.length} passages...`);
  // Google's free tier allows 100 embeddings a minute, so send them in
  // batches and wait a minute between batches.
  const embeddings: number[][] = [];
  for (let i = 0; i < passages.length; i += BATCH) {
    if (i > 0) {
      console.log("Waiting a minute for Google's free-tier limit...");
      await new Promise((resolve) => setTimeout(resolve, 62_000));
    }
    const batch = passages.slice(i, i + BATCH);
    const result = await callEmbed(
      { module: 3, feature: "embed-passages" },
      { values: batch.map((p) => p.text), task: "document" },
    );
    embeddings.push(...result.embeddings);
  }

  const file: PassageFile = {
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    passages: passages.map((p, i) => ({
      ...p,
      embedding: embeddings[i].map((n) => Math.round(n * 1e6) / 1e6),
    })),
  };
  await writeFile(OUT, JSON.stringify(file));

  console.log(`Saved ${OUT}. Passages per document:`);
  for (const doc of DOCUMENTS) {
    const n = passages.filter((p) => p.documentId === doc.id).length;
    console.log(`  ${doc.title}: ${n}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
