// The course's approved models. Calls go straight to Google with a Google AI
// Studio key, which is free and needs no credit card.
export const MODELS = [
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash (fast, shows its thinking)",
    // Google's own name for it, used when calling Google.
    googleId: "gemini-2.5-flash",
  },
  {
    id: "google/gemini-3-flash",
    label: "Gemini 3 Flash (newer, thinks out loud less often)",
    googleId: "gemini-3-flash-preview",
  },
  {
    id: "google/gemini-3.6-flash",
    label: "Gemini 3.6 Flash (newest; the older Flash models are retired or out of free quota)",
    googleId: "gemini-3.6-flash",
  },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

/**
 * The model used when a call doesn't name one. 2.5 Flash writes a summary of
 * its thinking for every question, which Ask Copper shows students.
 */
export const DEFAULT_MODEL: ModelId = "google/gemini-2.5-flash";

/**
 * The model that turns text into embeddings (lists of numbers that capture
 * meaning), used to find the passages that match a question. Each embedding is
 * cut down to EMBEDDING_DIMENSIONS numbers to keep the saved file small.
 */
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;

/** AI_MODEL if it names an approved model, otherwise the default. */
export function defaultModel(): ModelId {
  const id = process.env.AI_MODEL;
  return MODELS.find((m) => m.id === id)?.id ?? DEFAULT_MODEL;
}
