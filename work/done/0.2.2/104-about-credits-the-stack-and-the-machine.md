---
id: 104
title: About credits the stack and marks the machine
status: done
priority: normal
type: design
areas:
  - frontend
  - branding
created: 2026-09-02
completed: 2026-09-02
parent:
queue: "18"
---

# Goal

Give the About dialog the versions of the technologies GitOdile is built on,
with each vendor's mark beside it, and mark the operating system the app is
actually running on — without turning a product-identity surface into a
rendered `package.json`.

# User outcome

Opening About tells the user what the app is made of (Tauri, React, TypeScript,
Rust, each with the version this build actually shipped) and shows the mark of
the platform they are on beside the platform's name. A maintainer reading a
pasted diagnostics block now also learns which webview rendered the screen that
misbehaved.

# Context

The user asked for the versions of the technologies in About and for an opinion
on which ones belong there. Two things were separated in answering it:

- **Diagnostics** — what differs per machine and can explain a bug. React and
  TypeScript versions cannot: every user of a given build runs the same ones.
  The webview can, and was missing.
- **Credits** — what the product is made of. Those are the four the user asked
  for, and they belong in their own section with their own shape.

Build tooling (Vite, Vitest, pnpm, Node, TanStack, notify) was deliberately left
out. It is invisible to the user and its presence would make the section read as
a dependency list.

# Decisions

- **Versions are resolved at build time, never hardcoded.** `vite.config.ts`
  defines `__STACK_VERSIONS__` by reading the installed `node_modules` manifests
  (not `package.json`'s `^` ranges, which are constraints rather than versions),
  the `tauri` entry in `src-tauri/Cargo.lock`, and `rustc --version` from the
  build machine. `rust-toolchain.toml` pins a channel, so the toolchain is the
  only truthful source for a Rust number.
- **Anything unresolvable is omitted.** A frontend-only build with no Rust on
  `PATH` loses the Rust tile; a WebKit-based webview loses the webview row,
  because `AppleWebKit/605.1.15` is a frozen token that would put a meaningless
  number in a bug report. This follows the rule `formatDiagnostics` already had.
- **Vendor marks keep their vendor colours.** A logo reduced to one ink stops
  being recognizable at 14px, which is the only job it has here. `DESIGN.md`
  § Icons now records that its "no second icon library" rule governs *controls*,
  not artwork naming another product, and that Apple's mark — monochrome by its
  own brand definition — inherits `currentColor` so it works in both themes.
- **The stack marks reuse the vscode-icons set already bundled** for file-type
  icons, so nothing was redrawn and no dependency was added. Only the three OS
  marks are drawn by hand, because that set carries none.
- **The credits are one row of equal tiles, not capsules.** A mark beside short
  text wants to be a capsule, but four of them measure 468px against the 356px
  the dialog leaves, so they wrapped three-and-one and read as a ragged accident
  rather than a set. Stacking the mark above the name fits four columns in one
  row with room to spare, and resolves the shape question too: `DESIGN.md`
  § Shape defines a capsule as a *single-line* control, so a stacked one was
  never the right container. The row uses `grid-auto-flow: column`, so a build
  missing the Rust tile shows three equal columns rather than a gap.
- **The raw-SVG image adapter moved to `shared/ui/rawSvgImage.ts`.** ADR 0003
  admits a primitive there once two consumers share it; the file-type icons and
  About's credit tiles now do. It is imported by file from both, so the file-type set
  stays out of the entry chunk — which `check:architecture` enforces.

# Scope

- `vite.config.ts`, `src/vite-env.d.ts`: build-time stack versions.
- `src/app/stack.ts`: the four credited layers, their order, and omission.
- `src/app/vendorMarks.tsx`: stack marks and the three OS marks.
- `src/app/systemInfo.ts`: `readWebviewVersion`, and the webview line in the
  copied diagnostics block.
- `src/app/AppOverlays.tsx`, `src/app/app-shell.css`, `src/app/translations.ts`:
  the "Built with" tile row, the webview row, and the platform mark.
- `src/shared/ui/rawSvgImage.ts`, `src/shared/file-icons/index.ts`: the promoted
  adapter.
- `DESIGN.md`, `README.md`, `THIRD_PARTY_LICENSES.md`: the icon-rule carve-out,
  the About/diagnostics split, where the version table is surfaced, and
  nominative trademark use.

# Verification

- `pnpm run check` — documentation, frontend architecture, TypeScript, tests,
  build, and the Rust gates.
- New tests cover `readWebviewVersion` (names Chromium, stays silent on a frozen
  WebKit token), `describeStack` (fixed order, drops what it cannot resolve),
  and the dialog itself (row order with and without a webview, the platform mark
  is `aria-hidden`, and the credits stay out of the diagnostics list).
