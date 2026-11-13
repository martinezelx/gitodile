---
id: 017
title: Real per-file-type icons in file lists
status: done
priority: low
type: polish
areas:
  - frontend
created: 2026-07-28
completed: 2026-07-28
---

# Goal

Replace the single change-category icon (pencil/plus/minus/arrows/triangle)
shown next to each file in a file list with a real icon for that file's
language or tool, so a user can tell a `.ts` from a `.json` from a `Cargo.lock`
at a glance, the way VS Code's explorer does — without losing the existing
change-category signal.

# Context

The Changes screen (task 009), the publish commit file list, and the pending
versions list (tasks 010/011) all render a per-file row with one icon that
only ever meant "changed / new / deleted / renamed / conflicted". That icon
carried no information about the file itself. This was a design exploration
started from a user request ("could we show the file's own icon, like VS
Code?"), iterated live with the user through several rounds of mockups.

# Outcome

- Every file row across the Changes screen, the publish dialog's commit file
  panel, and the pending-versions file list now shows a real, colored icon for
  the file's type (language, config format, or package-manager lockfile),
  sourced from the `vscode-icons` MIT-licensed icon set via Iconify.
- The change-category icon (pencil/plus/minus/arrows/triangle) is kept, but
  moved to the trailing edge of the row as a small badge instead of sitting
  next to the file name — it now only draws attention when its color differs
  from the common "edited" case.
- Fixed an unrelated pre-existing bug found along the way: the "N unchanged
  lines" chip in the diff viewer was inheriting the dashed hunk-separator
  border meant for a bare line row, which pushed the chip visually off-center
  on every hunk after the first. The chip's divider was then redesigned, per
  user preference, into a full-width rounded bar instead of a floating pill.
- The icon set covers roughly 80 extensions/filenames spanning mainstream
  languages (TS/JS/Rust/Python/Java/Go/C/C++/C#/Kotlin/Swift/PHP/Ruby/
  Scala/Haskell/Clojure/Elixir/F#/Dart/Objective-C/Assembly/Lua/R/Perl),
  markup/config formats (JSON/YAML/TOML/INI/XML/HTML/CSS/SCSS/LESS/GraphQL),
  and named tooling files (lockfiles by package manager, `Dockerfile`,
  `Jenkinsfile`, `.editorconfig`, `.env`, `.eslintrc*`, `.prettierrc*`,
  `.babelrc`, `webpack.config.*`, `jest.config.*`, `vitest.config.*`,
  `tsconfig.json`, `jsconfig.json`, `composer.json`, `build.gradle*`,
  `LICENSE`), plus a generic fallback for anything unrecognized.

# Decisions

- **Icon source: `vscode-icons` via `@iconify-json/vscode-icons` + `unplugin-icons`**,
  not `lucide-react` tinted by hand and not the full `vscode-icons`/
  `material-icon-theme` npm packages. Reasoning discussed with the user:
  - License: `vscode-icons`' Iconify packaging is MIT; `material-icon-theme`
    is also MIT but has fewer icons; the standalone `vscode-icons` repo's own
    licensing history was murkier and not worth the risk.
  - Bundle cost: `unplugin-icons` compiles each `~icons/vscode-icons/<name>`
    import straight into a React SVG component at build time. Only the icons
    actually imported in `src/fileIcons.ts` ever reach the bundle — confirmed
    with a production build that grew from ~378 KB to ~608 KB (gzip 110→189
    KB) after importing ~80 of the collection's 1567 icons (~2–4 KB each),
    with zero trace of the 3.7 MB source JSON or the unused ~1490 icons in
    the output.
  - Runtime cost: negligible either way — rendering one `<svg>` instead of
    another costs the same regardless of source, and an unimported icon never
    touches memory.
- **Category icon moves to a trailing badge, not removed.** The user still
  wanted per-row change-state at a glance; putting the file-type icon and the
  category icon in the same slot made every "edited" row look identical and
  cluttered the one meaningful visual signal (a differently colored badge for
  new/deleted/renamed/conflicted).
- **Both icons vertically center on the full row height** (`align-self:
  center`), matching the checkbox — the file-type icon originally inherited
  the row's top-alignment (meant for the two-line name/dir stack) and looked
  visibly higher than the other two once the category badge moved to the
  trailing edge.
- **Type icons keep their own fixed brand colors**, not `currentColor` — the
  point of using a real icon set is the recognizable per-brand color, so the
  pre-existing `--attention` color override on the icon was removed as
  dead/misleading CSS once confirmed the SVGs use fixed hex fills.
- **"N unchanged lines" divider: full-width rounded bar, left-aligned text**,
  chosen by the user after comparing five mocked options (plain pill, pill
  bisecting a line, dashed variant, sandwiched hairlines, full bar). Uses the
  same `--radius-md` as the rest of the app's cards.

# Implementation notes

- `vite.config.ts`: registered `Icons({ compiler: "jsx", jsx: "react" })`
  from `unplugin-icons`, which needed `@svgr/core` + `@svgr/plugin-jsx` as
  peer tooling for its JSX compiler.
- `src/vite-env.d.ts`: added `/// <reference types="unplugin-icons/types/react" />`
  so `~icons/*` virtual imports type-check.
- `src/fileIcons.ts`: `getFileTypeIcon(path)` — looks up the bare file name
  against an exact-name table (lockfiles, `Dockerfile`, `LICENSE`, ...), then
  a prefix table (`.eslintrc*`, `webpack.config*`, ...), then the extension
  table, falling back to a generic file icon. Every icon is a static
  top-level import (not a dynamic per-lookup import) so `unplugin-icons` can
  resolve and tree-shake them at build time.
- `src/changes.tsx`: `FileListItem` renders `<FileTypeIcon />` where the
  category icon used to sit, and the category icon moved to
  `.changes-file-item__category-icon` after the file details, pushed to the
  row's trailing edge via `margin-left: auto`. The diff-marker fix is in
  `DiffHunkList`: `isHunkStart` now requires `row.kind === "line"`, since a
  marker row already signals the hunk boundary itself.
- `src/publishDialog.tsx`, `src/pendingVersions.tsx`: same treatment applied
  to `CommitFilesPanel` / `CommitFilesList`, reusing `getFileTypeIcon` and
  `CATEGORY_ICONS` (exported from `changes.tsx`) rather than duplicating the
  mapping.
- `src/styles.css`: `.diff-hunk__marker` changed from a centered pill
  (`border-radius: 999px`, `width: fit-content`) to a full-width rounded bar;
  `.changes-file-item__category-icon`, `.pending-versions__file-category`,
  and `.publish-commit-list__file-category` all follow the same
  trailing-badge pattern.
- Verified with isolated React renders (temporary test files, deleted after
  use) rather than the live Tauri app, since the frontend dev server has no
  way to open a real project outside the Tauri runtime — confirmed real
  per-type SVGs and their distinct brand-color fills render for a mixed
  fixture of file types.

# Validation

- `npx tsc --noEmit -p .` — pass, both after the initial integration and
  after each icon-set expansion.
- `npx vitest run` — pass, 71 tests (no existing test asserted on icon
  internals, so none needed updating).
- `npx vite build` — pass; used specifically to confirm every
  `~icons/vscode-icons/<name>` import resolves to a real icon in the
  collection (a typo would fail the build, since `tsc` alone can't validate
  the virtual module's content) and to observe actual bundle-size impact.
- No live Tauri verification was possible for the icon change itself (no open
  project available outside the native runtime); the user visually confirmed
  each design iteration through generated mockups (Artifacts) before it was
  implemented in the real components.
