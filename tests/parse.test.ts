import { describe, expect, it } from "vitest";
import { ManuscriptExportError, parseManuscriptExport } from "../src/parse.js";
import { MANUSCRIPT_EXPORT_FORMAT, MANUSCRIPT_EXPORT_KIND, type ManuscriptExport } from "../src/schema.js";

const validExport: ManuscriptExport = {
  kind: MANUSCRIPT_EXPORT_KIND,
  format: MANUSCRIPT_EXPORT_FORMAT,
  exportedAt: "2026-10-02T00:00:00.000Z",
  sourceApp: "storybook-ai",
  sourceBookId: "book-1",
  title: "Night Keys",
  illustrationStyle: "Watercolor",
  synopsis: "A bartender finds a smuggler's key.",
  chapters: [
    {
      id: "ch1",
      sequence_index: 0,
      title: "The quay",
      prose: "Emma walked to the quay.",
      brief: "Establish Emma's routine.",
      scenes: [
        {
          id: "ch1:scene-1",
          sequence_index: 0,
          title: "Arrival",
          description: "Emma walked to the quay.",
          instructions: "Keep it quiet."
        }
      ]
    }
  ],
  bible: [
    {
      kind: "characters",
      label: "Characters",
      entities: [
        {
          entity_ref: "emma",
          name: "Emma",
          facts: [{ predicate: "core.identity", label: "Identity", value: "Bartender" }],
          referenceImages: []
        }
      ]
    }
  ]
};

describe("parseManuscriptExport", () => {
  it("accepts a well-formed export", () => {
    expect(parseManuscriptExport(validExport)).toEqual(validExport);
  });

  it("rejects a non-object", () => {
    expect(() => parseManuscriptExport("not an object")).toThrow(ManuscriptExportError);
    try {
      parseManuscriptExport(null);
    } catch (err) {
      expect((err as ManuscriptExportError).code).toBe("not-export");
    }
  });

  it("rejects a file of the wrong kind", () => {
    try {
      parseManuscriptExport({ ...validExport, kind: "storybook-ai.manuscript" });
      throw new Error("expected to throw");
    } catch (err) {
      expect((err as ManuscriptExportError).code).toBe("wrong-kind");
    }
  });

  it("rejects a newer format than this build understands", () => {
    try {
      parseManuscriptExport({ ...validExport, format: MANUSCRIPT_EXPORT_FORMAT + 1 });
      throw new Error("expected to throw");
    } catch (err) {
      expect((err as ManuscriptExportError).code).toBe("newer-format");
    }
  });

  it("rejects a structurally invalid export", () => {
    try {
      parseManuscriptExport({ ...validExport, bible: "not an array" });
      throw new Error("expected to throw");
    } catch (err) {
      expect((err as ManuscriptExportError).code).toBe("invalid");
    }
  });

  it("fills in defaults for optional arrays", () => {
    const { facts, referenceImages, ...entityWithoutDefaults } = validExport.bible[0]!.entities[0]!;
    const result = parseManuscriptExport({
      ...validExport,
      bible: [{ ...validExport.bible[0], entities: [entityWithoutDefaults] }]
    });
    expect(result.bible[0]?.entities[0]?.facts).toEqual([]);
    expect(result.bible[0]?.entities[0]?.referenceImages).toEqual([]);
  });

  it("still accepts a format-1 export, filling in empty defaults for everything format 2 added", () => {
    const legacyChapter = { id: "ch1", sequence_index: 0, title: "The quay", prose: "Emma walked to the quay." };
    const result = parseManuscriptExport({
      ...validExport,
      format: 1,
      synopsis: undefined,
      chapters: [legacyChapter]
    });
    expect(result.format).toBe(1);
    expect(result.synopsis).toBe("");
    expect(result.chapters[0]?.brief).toBe("");
    expect(result.chapters[0]?.scenes).toEqual([]);
  });

  it("carries a format-2 export's synopsis and per-chapter brief/scenes", () => {
    const result = parseManuscriptExport(validExport);
    expect(result.synopsis).toBe("A bartender finds a smuggler's key.");
    expect(result.chapters[0]?.brief).toBe("Establish Emma's routine.");
    expect(result.chapters[0]?.scenes).toEqual([
      {
        id: "ch1:scene-1",
        sequence_index: 0,
        title: "Arrival",
        description: "Emma walked to the quay.",
        instructions: "Keep it quiet."
      }
    ]);
  });
});
