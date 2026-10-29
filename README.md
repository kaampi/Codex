# StoryCore (kaampi Codex)

Shared, versioned export contract for the kaampi family of creative apps — currently [kaampi Write](https://github.com/kaampi/Write) and [kaampi Comic](https://github.com/kaampi/Comic). "StoryCore" is this repository's and package's stable technical name; the app itself is branded kaampi Codex.

## Repository layout

The repo root **is** the `@ocedo-apps/storycore` package described below (`src/`, `dist/` once built) — that's deliberate: kaampi Write and kaampi Comic consume it as a plain npm git dependency pointed at this repo's root (`git+https://github.com/kaampi/Codex.git`), and npm's git-dependency support has no notion of "look in a subdirectory" — the fetched repo's own root `package.json` has to be the thing they get.

[`packages/service`](packages/service) is a sibling npm workspace, `@ocedo-apps/storycore-service` — the local Core service (SQLite-backed workspaces, grants, revisions, media, encrypted/scheduled backups and a local `/admin` page). Nobody installs it as a dependency; it's run directly (`node server.mjs`). It depends on the root package by name (`@ocedo-apps/storycore`) to validate manuscript publications against the same contract — `npm install` at the repo root links that automatically via npm workspaces.

`npm run build`/`npm test` at the root build/test the schema package only; the service package has its own `npm test` (see below).

## What this is

Two things, deliberately kept separate (see "Repository layout" above):

- **The schema package (repo root)** — a small TypeScript package: a [Zod](https://zod.dev) schema and a validator for `ManuscriptExport`, the one shape kaampi Write exports and sibling apps import. Nothing else. It holds no data of its own — no database, no server. It is a shared vocabulary, not a shared place.
- **The service (`packages/service`)** — a local, SQLite-backed service that *does* hold data: per-manuscript private version checkpoints, filtered shared-manuscript projections for Sandbox/Comic, and encrypted backups. It runs entirely on the user's own machine; nothing here is a hosted or cloud service. The invariant below still holds for it — see "Additive integration contract" in [`docs/core-architecture.md`](https://github.com/kaampi/Write/blob/main/docs/core-architecture.md) in the kaampi Write repo for the full access-control model (grants, private-snapshot isolation, proposal/accept flow).

## The invariant this package exists to enforce

**kaampi Write owns Story Bible canon. Every other app is a reader of a point-in-time export, never a writer back into it.**

- An export is a snapshot. There is no live link — a change in kaampi Write after the export was taken is invisible to the app that imported it until a new export is made.
- `ManuscriptExport` only contains **locked, visible** facts — the same visibility rule Draft itself uses (`visibleLockedFacts`: locked, not superseded, not hidden from the model, not a hidden entity). An unreviewed or flagged fact is never exported as if it were settled canon.
- If a sibling app produces something worth bringing back — a generated character portrait, a detail invented while adapting a chapter — the way back is never a direct write into another app's data. It goes through that app's own existing human review queue (e.g. kaampi Write's Import lore flow), exactly like any other unverified source (an extractor, an interview, a brainstorm note). Source app is not a reason to skip review.

If a change ever needs a direct write path between two apps' own data, that is a different, far more sensitive decision than anything this package does — not something to introduce quietly as a side effect of using kaampi Codex.

## Why the export schema isn't kaampi Write's internal `Book` type

kaampi Write's own `Book` schema changes often — new fields land most releases. Binding a sibling app to that internal shape directly would make ordinary kaampi Write development a constant risk of breaking every sibling app. `ManuscriptExport` is deliberately smaller and changes only when the *contract* changes, versioned via its own `format` number — independent of kaampi Write's own version number.

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

v0.2.0, `MANUSCRIPT_EXPORT_FORMAT = 2` — kaampi Write → kaampi Comic direction only.

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

`CORE_DB_PATH` is optional — unset, it defaults to `%LOCALAPPDATA%\StoryCore\core.db` on Windows (`~/.storycore/core.db` elsewhere), creating the folder if needed, so a zero-configuration install works with no environment variables set at all. (That folder/path name stays `StoryCore` regardless of the app's `kaampi Codex` branding — a rebrand must never orphan an already-paired install's data.)

On first run with a brand-new database, the executable auto-provisions every credential (`storybook`, `sandbox`, `comic`, an admin key) and writes them to `<CORE_DB_PATH>.bootstrap.json` instead of requiring the `provision`/`provision-admin` CLI commands — see `bootstrap.mjs`. A pairing desktop app reads that file directly; nobody needs to copy a 64-character key by hand. `.github/workflows/service-build-windows.yml` builds and smoke-tests this (both an explicit `CORE_DB_PATH` and the zero-config default) on `windows-latest` on every push, and publishes the result as a `storycore-service-v<version>` GitHub Release.

Unsigned build, same stance as kaampi Write's own desktop installer — no code-signing secrets configured yet, so Windows SmartScreen will warn on first run.

## Installing kaampi Codex (Windows)

[`installer/storycore-installer.iss`](installer/storycore-installer.iss) wraps the executable above into an ordinary Windows installer: no admin rights, downloads the current service build at install time (so the installer itself rarely needs rebuilding), and sets up a Startup-folder shortcut so Core runs quietly in the background from then on — no command prompt, no configuration. `.github/workflows/installer-build.yml` compiles it with Inno Setup and publishes it to a dedicated `storycore-installer` GitHub Release, kept at a stable URL regardless of which service version it fetches. Pairing a sibling app (kaampi Write, kaampi Comic, kaampi Explore) with the now-running service happens from inside that app's own "Connect" screen.

## License

GPL-3.0, same as [kaampi Write](https://github.com/kaampi/Write) — see [LICENSE](LICENSE).
