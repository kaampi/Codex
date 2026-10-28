# StoryCore

Shared, versioned export contract for the StoryBook AI family of apps — currently [StoryBook AI](https://github.com/ocedo-apps/StoryBook-AI) and [ComicBook AI](https://github.com/ocedo-apps/ComicBook-AI).

## Repository layout

The repo root **is** the `@ocedo-apps/storycore` package described below (`src/`, `dist/` once built) — that's deliberate: StoryBook AI and ComicBook AI consume it as a plain npm git dependency pointed at this repo's root (`git+https://github.com/ocedo-apps/storycore.git`), and npm's git-dependency support has no notion of "look in a subdirectory" — the fetched repo's own root `package.json` has to be the thing they get.

[`packages/service`](packages/service) is a sibling npm workspace, `@ocedo-apps/storycore-service` — the local Core service (SQLite-backed workspaces, grants, revisions, media, encrypted/scheduled backups and a local `/admin` page). Nobody installs it as a dependency; it's run directly (`node server.mjs`). It depends on the root package by name (`@ocedo-apps/storycore`) to validate manuscript publications against the same contract — `npm install` at the repo root links that automatically via npm workspaces.

`npm run build`/`npm test` at the root build/test the schema package only; the service package has its own `npm test` (see below).

## What this is

Two things, deliberately kept separate (see "Repository layout" above):

- **The schema package (repo root)** — a small TypeScript package: a [Zod](https://zod.dev) schema and a validator for `ManuscriptExport`, the one shape StoryBook AI exports and sibling apps import. Nothing else. It holds no data of its own — no database, no server. It is a shared vocabulary, not a shared place.
- **The service (`packages/service`)** — a local, SQLite-backed service that *does* hold data: per-manuscript private version checkpoints, filtered shared-manuscript projections for Sandbox/Comic, and encrypted backups. It runs entirely on the user's own machine; nothing here is a hosted or cloud service. The invariant below still holds for it — see "Additive integration contract" in [`docs/core-architecture.md`](https://github.com/ocedo-apps/StoryBook-AI/blob/main/docs/core-architecture.md) in the StoryBook AI repo for the full access-control model (grants, private-snapshot isolation, proposal/accept flow).

## The invariant this package exists to enforce

**StoryBook AI owns Story Bible canon. Every other app is a reader of a point-in-time export, never a writer back into it.**

- An export is a snapshot. There is no live link — a change in StoryBook AI after the export was taken is invisible to the app that imported it until a new export is made.
- `ManuscriptExport` only contains **locked, visible** facts — the same visibility rule Draft itself uses (`visibleLockedFacts`: locked, not superseded, not hidden from the model, not a hidden entity). An unreviewed or flagged fact is never exported as if it were settled canon.
- If a sibling app produces something worth bringing back — a generated character portrait, a detail invented while adapting a chapter — the way back is never a direct write into another app's data. It goes through that app's own existing human review queue (e.g. StoryBook AI's Import lore flow), exactly like any other unverified source (an extractor, an interview, a brainstorm note). Source app is not a reason to skip review.

If a change ever needs a direct write path between two apps' own data, that is a different, far more sensitive decision than anything this package does — not something to introduce quietly as a side effect of using StoryCore.

## Why the export schema isn't StoryBook AI's internal `Book` type

StoryBook AI's own `Book` schema changes often — new fields land most releases. Binding a sibling app to that internal shape directly would make ordinary StoryBook AI development a constant risk of breaking every sibling app. `ManuscriptExport` is deliberately smaller and changes only when the *contract* changes, versioned via its own `format` number — independent of StoryBook AI's own version number.

## Usage

```ts
import { parseManuscriptExport, ManuscriptExportError } from "@ocedo-apps/storycore";

try {
  const manuscript = parseManuscriptExport(JSON.parse(raw));
  // manuscript.bible is already grouped by BibleKind (characters, locations, objects, groups, events, concepts)
  // manuscript.chapters is already in reading order
} catch (err) {
  if (err instanceof ManuscriptExportError) {
    // err.code: "not-export" | "wrong-kind" | "newer-format" | "invalid"
  }
}
```

## Status

v0.2.0, `MANUSCRIPT_EXPORT_FORMAT = 2` — StoryBook AI → ComicBook AI direction only.

Format 2 adds, for comic/series adaptation: a manuscript-level `synopsis`,
and per-chapter `brief` (the author's own writing instruction for that
chapter) plus `scenes` (each with `id`, `sequence_index`, optional `title`,
`description` — the scene's own slice of the chapter's prose, i.e. what
actually happens — and optional `instructions`, the scene's own writing
note). A chapter never split into scenes still exports one scene spanning
its whole prose. A format-1 export still validates under this schema; the
new fields default to `""`/`[]` when absent.

## Building a standalone Core service (no Node.js install required)

`packages/service` can be packaged into one self-contained executable using Node's built-in [Single Executable Applications](https://nodejs.org/api/single-executable-applications.html) feature — the target machine needs nothing installed, not even Node.js:

```sh
cd packages/service
npm run build:exe
```

This bundles `server.mjs` and everything it imports (esbuild, to CommonJS — Node's SEA packaging does not accept an ESM main script) into `dist/core-service.cjs`, then injects it into a copy of the current Node binary at `dist/storycore-service` (`.exe` on Windows). The admin page's static files (`admin.html`/`.css`/`.js`) are embedded as SEA assets rather than read off disk — `sea-assets.mjs` reads them from disk during ordinary `node server.mjs` use (dev, tests) and from the SEA asset store when running as the packaged executable, picking the right one automatically via `node:sea`'s `isSea()`.

On first run with a brand-new `CORE_DB_PATH`, the executable auto-provisions every credential (`storybook`, `sandbox`, `comic`, an admin key) and writes them to `<CORE_DB_PATH>.bootstrap.json` instead of requiring the `provision`/`provision-admin` CLI commands — see `bootstrap.mjs`. A pairing desktop app reads that file directly; nobody needs to copy a 64-character key by hand. `.github/workflows/service-build-windows.yml` builds and smoke-tests this on `windows-latest` on every push.

Unsigned build, same stance as StoryBook AI's own desktop installer — no code-signing secrets configured yet, so Windows SmartScreen will warn on first run. An actual installer (Windows Startup entry, a sensible default data directory) that wraps this executable is separate, not-yet-built work.

## License

GPL-3.0, same as [StoryBook AI](https://github.com/ocedo-apps/StoryBook-AI) — see [LICENSE](LICENSE).
