import { z } from "zod";

/**
 * The shared vocabulary for what kind of thing a Story Bible entity is.
 * Mirrors kaampi Write's own `BIBLE_KINDS` (`bibleGroups.ts`) — a small,
 * rarely-changing enum, intentionally duplicated here rather than imported,
 * since kaampi Codex must never depend on kaampi Write's internal modules.
 */
export const BIBLE_KINDS = ["characters", "locations", "objects", "groups", "events", "concepts"] as const;
export const BibleKindSchema = z.enum(BIBLE_KINDS);
export type BibleKind = z.infer<typeof BibleKindSchema>;

/**
 * One claim about an entity. `predicate` is carried through as an opaque
 * string (provenance only) — a consuming app has no business interpreting
 * kaampi Write's internal predicate taxonomy, only displaying `label` and
 * `value`. Classification into a `BibleKind` has already happened on the
 * kaampi Write side before export; nothing here needs to re-derive it.
 */
export const ExportedFactSchema = z.object({
  predicate: z.string().min(1),
  label: z.string().min(1),
  value: z.string().min(1)
});
export type ExportedFact = z.infer<typeof ExportedFactSchema>;

/**
 * One Story Bible entity and everything a sibling app needs to use it —
 * structured fields, not the flattened display lines kaampi Write's own
 * human-readable Publish export uses. `referenceImages` carries existing
 * portraits/pictures inline as data URLs, the same way kaampi Write's own
 * backup format embeds images — no separate asset files to keep track of.
 */
export const ExportedEntitySchema = z.object({
  entity_ref: z.string().min(1),
  name: z.string().min(1),
  facts: z.array(ExportedFactSchema).default([]),
  pronoun: z.string().min(1).optional(),
  approximateAge: z.number().int().nonnegative().optional(),
  looks: z.string().min(1).optional(),
  personality: z.string().min(1).optional(),
  referenceImages: z.array(z.string().min(1)).default([])
});
export type ExportedEntity = z.infer<typeof ExportedEntitySchema>;

export const ExportedBibleSectionSchema = z.object({
  kind: BibleKindSchema,
  label: z.string().min(1),
  entities: z.array(ExportedEntitySchema)
});
export type ExportedBibleSection = z.infer<typeof ExportedBibleSectionSchema>;

/**
 * One scene within a chapter, in reading order. `description` is the
 * scene's own slice of the chapter's prose — "what actually happens" at
 * scene granularity, always present (possibly ""), never the AI-generated
 * kind of summary. `instructions` is the scene's own writing note (focus,
 * required beats, editorial reminders) — not in-world canon, the same
 * distinction `brief` draws at the chapter level below.
 */
export const ExportedSceneSchema = z.object({
  id: z.string().min(1),
  sequence_index: z.number().int().nonnegative(),
  title: z.string().min(1).optional(),
  description: z.string(),
  instructions: z.string().min(1).optional()
});
export type ExportedScene = z.infer<typeof ExportedSceneSchema>;

export const ExportedChapterSchema = z.object({
  id: z.string().min(1),
  sequence_index: z.number().int().nonnegative(),
  title: z.string(),
  prose: z.string(),
  /** The chapter's own writing instruction — not in-world canon. Always present, "" when the author left it empty. Added in format 2; defaults to "" reading a format-1 export. */
  brief: z.string().default(""),
  /**
   * Always at least one entry for a chapter with any prose — a chapter the
   * author never explicitly split still gets one scene spanning its whole
   * prose (same convention kaampi Write uses internally), so this is never
   * an empty array for a non-empty chapter. Added in format 2; defaults to
   * [] reading a format-1 export, which has no scene data to recover.
   */
  scenes: z.array(ExportedSceneSchema).default([])
});
export type ExportedChapter = z.infer<typeof ExportedChapterSchema>;

export const MANUSCRIPT_EXPORT_KIND = "storycore.manuscript-export";
/**
 * Format 2 adds `synopsis` (manuscript-level) and `brief`/`scenes` (per
 * chapter) — for comic/series adaptation, where a sibling app wants the
 * author's own structural intent (what each chapter/scene is *for*) and
 * scene breakdown (for page/panel planning), not just raw prose. Both new
 * chapter fields default to their format-1-compatible empty value, so a
 * format-1 export still parses under the format-2 schema unchanged.
 */
export const MANUSCRIPT_EXPORT_FORMAT = 2;

/**
 * The full export contract. Deliberately NOT kaampi Write's internal `Book`
 * type — `Book` gains fields almost every release; binding a sibling app to
 * it directly would make every kaampi Write change a possible breakage for
 * every sibling app. This shape only grows when the contract itself changes,
 * versioned via `format`.
 *
 * Only locked, visible facts belong in `bible` — the same visibility rule
 * Draft itself uses (`visibleLockedFacts`: locked, not superseded, not
 * hidden from the model, not a hidden entity), not kaampi Write's more
 * permissive human-facing Publish export. A sibling app feeds this into
 * further AI generation, the same category of consumer as Draft, so it
 * should see only what Draft itself would see.
 */
export const ManuscriptExportSchema = z.object({
  kind: z.literal(MANUSCRIPT_EXPORT_KIND),
  // A union of every format this package has ever understood, not just the
  // current one — so a format-1 export (literal 1) still validates under
  // today's schema, same as it always has. parse.ts's own "newer-format"
  // check is what actually rejects a format this build doesn't know yet;
  // this union only needs to list formats *up to* MANUSCRIPT_EXPORT_FORMAT.
  format: z.union([z.literal(1), z.literal(2)]),
  exportedAt: z.string().min(1),
  sourceApp: z.literal("storybook-ai"),
  sourceBookId: z.string().min(1),
  title: z.string(),
  illustrationStyle: z.string().default(""),
  /** The manuscript-level synopsis — added in format 2, defaults to "" reading a format-1 export. */
  synopsis: z.string().default(""),
  chapters: z.array(ExportedChapterSchema),
  bible: z.array(ExportedBibleSectionSchema)
});
export type ManuscriptExport = z.infer<typeof ManuscriptExportSchema>;
