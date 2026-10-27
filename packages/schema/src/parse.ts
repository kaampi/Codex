import { ManuscriptExportSchema, MANUSCRIPT_EXPORT_FORMAT, MANUSCRIPT_EXPORT_KIND, type ManuscriptExport } from "./schema.js";

export type ManuscriptExportErrorCode = "not-export" | "wrong-kind" | "newer-format" | "invalid";

export class ManuscriptExportError extends Error {
  readonly code: ManuscriptExportErrorCode;

  constructor(code: ManuscriptExportErrorCode, message: string) {
    super(message);
    this.name = "ManuscriptExportError";
    this.code = code;
  }
}

/**
 * The one way any sibling app should read a StoryBook AI manuscript export —
 * never hand-rolled field-by-field guessing. Throws a `ManuscriptExportError`
 * with a specific code so a caller can show the right message (wrong file
 * entirely, vs. a future format version this build doesn't understand yet).
 */
export function parseManuscriptExport(input: unknown): ManuscriptExport {
  if (!input || typeof input !== "object") {
    throw new ManuscriptExportError("not-export", "That file is not a StoryCore manuscript export.");
  }
  const row = input as Record<string, unknown>;
  if (row.kind !== MANUSCRIPT_EXPORT_KIND) {
    throw new ManuscriptExportError("wrong-kind", "That file is not a StoryCore manuscript export.");
  }
  const format = typeof row.format === "number" ? row.format : undefined;
  if (format !== undefined && format > MANUSCRIPT_EXPORT_FORMAT) {
    throw new ManuscriptExportError(
      "newer-format",
      "This export uses a newer StoryCore format than this app understands yet. Update the app, then try again."
    );
  }
  const result = ManuscriptExportSchema.safeParse(input);
  if (!result.success) {
    throw new ManuscriptExportError("invalid", "The file could not be read as a valid manuscript export.");
  }
  return result.data;
}
