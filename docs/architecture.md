# Architecture

How the Copper State Labs app fits together. Each module adds a section at the
end (see [Adding a module](#adding-a-module)) when it changes how the app
works: new pages, tables or AI calls.

_Fictional — for educational use._

## The starter app (Module 0)

A Next.js app that builds, runs and deploys with **no environment variables**.
A Google AI Studio key is optional until a module needs one.

| Piece | Where | What it does |
|---|---|---|
| Pages | `app/` | `layout.tsx` sets the fonts and theme; `page.tsx` is the placeholder home page |
| Brand components | `components/copper/` | `Logo`, `SiteHeader`, `SiteFooter`, `ModeToggle` |
| UI kit | `components/ui/` (shadcn), `components/ai-elements/` (AI Elements) | The only UI libraries the app uses |
| Setup card | `components/setup-required.tsx` | `<SetupRequired service="ai" />`, shown instead of a page whose service isn't configured |
| Company catalog | `lib/copper/catalog.ts`, `lib/copper/data/catalog.json` | Product, plan and privacy facts from the Product Bible (Sections 3, 4, 8 and 10). Pages read prices and plan details from here instead of typing them (added in the Module 1 starter) |
| AI wrapper | `lib/ai/call.ts` | `callText` and `callObject`: every model call goes through these and is logged to the terminal |
| Models and prices | `lib/ai/models.ts`, `lib/ai/pricing.ts` | The approved Gemini models and their token prices |

## Data flow

1. A user opens a page in `app/`.
2. Server code checks what's configured (`isAiConfigured()`). If the key is
   missing, the page renders `<SetupRequired />` instead of crashing.
3. Data comes from files under `lib/copper/data/`.
4. AI requests go through `callText` / `callObject` in `lib/ai/call.ts`, which
   calls Google and then prints one `[ai_calls]` line: `module`, `feature`,
   `model`, tokens, `cost_usd`, `latency_ms`, `ok`.

```ts
const { text } = await callText(
  { module: 2, feature: "ask-copper" },
  { prompt },
);
```

## Two kinds of "AI tiers"

Don't mix these up:

- **Copper State Labs' product tiers** (On-device, Raw Ore, Refined, the
  Copper Cloud) are part of the fictional company. They are facts in the
  [Product Bible](copper-state-labs/product-bible.md) and rows in the `ai_tiers`
  table.
- **The models this app calls** are real Claude models listed in
  `lib/ai/models.ts`. Their cost is logged in `ai_calls`.

## Decisions

- **No environment variables required.** Every service is optional, so a fresh
  clone builds and deploys before any accounts are set up.
- **One AI wrapper.** Routing every call through `lib/ai/call.ts` gives one
  place to log cost and latency per module and feature.
- **No authentication or row-level security yet.** They arrive in a later
  module.

## Adding a module

When a module changes how the app fits together, add a section here:

```md
## Module N: <feature name>

**Summary:** one or two sentences: what this adds and why.

| Piece | Where | What it does |
|---|---|---|
| Page / route | `app/...` | |
| Components | `components/...` | |
| Data | `lib/copper/data/...` | Data files added |
| AI calls | `lib/ai/call.ts` (module, feature) | Model, prompt purpose, expected cost per call |

**Data flow:** user action → page → server code → database / model → response.

**Decisions and trade-offs:** what you chose, the alternatives, and why.

**Risks and open questions:** cost, privacy, accuracy or safety risks, and how
you handle them.
```

## Module 3 starter: Ask Copper

**Summary:** Ask Copper, the Module 2 shopping chatbot, finished: a floating
chat panel that answers prices, totals and stock with four tools and shows
each step. Module 3 teaches it to answer from the customer documents.

| Piece | Where | What it does |
|---|---|---|
| Component | `components/copper/ask-copper.tsx` | The launcher and chat panel, mounted from `app/page.tsx` and opened by the header's `#ask` link. Draws each answer as stations: the tools on offer, thinking, each tool call, then the reply |
| Server Action | `lib/copper/assistant/ask.ts` | `askCopper()`: streams the conversation with `callStream`, up to 5 steps, and sends each step back as a live `Progress` |
| Tools | `lib/copper/assistant/tools.ts` | `copperTools`: `get_products`, `get_prices`, `calculate_cost`, `check_availability` |
| Instructions | `lib/copper/assistant/instructions.ts` | `COPPER_INSTRUCTIONS`. Copper says it can't help yet with warranty, setup, troubleshooting or privacy |
| Data | `lib/copper/inventory.ts`, `lib/copper/documents.ts` | Stock from `lib/copper/data/inventory.json`; `DOCUMENTS`: the four customer documents and their PDF paths under `public/docs/`. The PDFs are added in class |
| AI calls | `{ module: 2, feature: "ask-copper" }` | One streamed call per question |

## Module 3 part 1: document passages (RAG, step 1)

**Summary:** The four customer PDFs in `public/docs/` are cut into short
passages and turned into embeddings (lists of numbers that capture meaning), so
Ask Copper can later find the passages that match a question.

| Piece | Where | What it does |
|---|---|---|
| Script | `scripts/build-passages.ts` (`npm run build-passages`) | Reads each PDF page by page, splits it into passages of about three sentences, embeds them, and saves `lib/copper/data/passages.json`. Re-run it when a PDF changes |
| Splitter | `lib/copper/split.ts` | `splitPage()`: a page's sentences in groups of three, each passage starting with the document title. Passages never cross a page |
| Data | `lib/copper/data/passages.json`, `lib/copper/passages.ts` | `PASSAGES`: each passage's id, document, title, page, text and embedding. Importing it loads the whole file into memory when the app starts |
| AI calls | `callEmbed()` in `lib/ai/call.ts`, `{ module: 3, feature: "embed-passages" }` | `gemini-embedding-001`, 768 numbers per passage. Sent in batches of 90 because Google's free tier allows 100 embeddings a minute |

## Module 3 part 2: search_docs

**Summary:** Ask Copper has a fifth tool, `search_docs`, that answers setup,
troubleshooting, warranty and policy questions from the customer documents
instead of from memory.

| Piece | Where | What it does |
|---|---|---|
| Search | `lib/copper/search.ts` | `searchDocs(question)`: embeds the question (as a query), compares it to every passage by cosine similarity, and returns the 5 closest, each with document title, page, text, score and a link that opens the PDF at that page (`/docs/<id>.pdf#page=N`) |
| Tool | `lib/copper/assistant/tools.ts` | `search_docs`, described to the model for setup, troubleshooting, warranty, refund and privacy questions |
| Instructions | `lib/copper/assistant/instructions.ts` | Copper must call `search_docs` for those questions, answer only from what it returns, and name the document and page |
| Tool card | `components/copper/ask-copper.tsx` | Lists the 5 passages with title, match percentage, an "Open page N" link and a snippet |
| AI calls | `{ module: 3, feature: "search-docs" }` | One embedding call per search, plus the usual `ask-copper` call |
