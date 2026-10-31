---
id: 111
title: A changed image is shown as an image, and an SVG as a drawing
status: done
priority: normal
type: feature
areas:
  - frontend
  - desktop
created: 2026-09-04
completed: 2026-09-04
parent:
queue:
---

# Goal

Show a changed image as a picture instead of a note explaining that it cannot
be shown, and show a changed SVG as the drawing it is — with its source one
click away, not instead of it.

# User outcome

A designer who replaces `logo.png` sees the old logo and the new one next to
each other, with their sizes and dimensions, and can tell in one glance whether
the export went wrong. Today the same person sees *"This file can't be
previewed as text"* and has to leave GitOdile to answer the question.

Someone who hand-edits an icon's `<path>` sees the shape that came out of it.
Today they see `d="M12 3.2 4.8 7.4…"` on one line and `d="M12 3.4 4.8 7.6…"` on
the next, which is an honest diff and a useless one — the whole reason to look
at an icon change is to see whether it still looks like the icon.

# Context

Two different code paths produce the same disappointment today.

**Raster images** trip `looks_binary` — a NUL byte in the first 8 KB
([`changes.rs:624`](../../../src-tauri/src/changes.rs)) — or Git's own
`Binary files … differ` marker, and become `FileDiff::Binary`
([`changes.rs:70`](../../../src-tauri/src/changes.rs)). The view renders that as an
`EmptyDiffNote` ([`DiffResultView.tsx:985`](../../../src/features/changes/DiffResultView.tsx)).
The classification is right; the payload is empty, so nothing better *can* be
drawn without new data from Rust.

**SVG** has no NUL bytes, so it is classified `Text` and gets the full
line-by-line treatment — syntax highlighting, search, split view, all of it
applied to coordinate soup.

Both are the industry default, and the SVG half is the interesting one:

- GitHub Desktop renders raster images with four modes — 2-up, Swipe, Onion
  Skin and Difference — inherited from
  [github.com's 2011 image view modes](https://github.blog/2011-03-21-behold-image-view-modes/),
  covering PNG, JPG, GIF and PSD
  ([GitHub Docs](https://docs.github.com/en/repositories/working-with-files/using-files/working-with-non-code-files)).
  SVG it shows as plain text; the request to render it
  ([desktop/desktop#11316](https://github.com/desktop/desktop/issues/11316)) is
  open and labelled `not-planned`.
- Tower, Fork and GitKraken all advertise image diffing, and all of them stop at
  raster. VS Code is the same: images side by side, SVG as text with a separate
  "Open Preview" command.

So **every mainstream client treats "image" as "raster format"** and leaves the
one format people actually hand-edit and version on the code side of the line.
For an app whose stated audience includes designers and non-developers
([`AGENTS.md`](../../../AGENTS.md) § Target users), that is a gap worth closing on
purpose rather than a feature to copy.

Two constraints are already settled and shape the design:

- [`tauri.conf.json`](../../../src-tauri/tauri.conf.json) already allows `data:` in
  `img-src`. Previews therefore need **no CSP or capability change** — as long
  as they are drawn through `<img>`.
- Task [018](../0.1.0/018-startup-launch-performance.md) traded `opt-level = "s"`,
  `lto` and `strip` for launch time. A Rust image-decoding dependency spends
  that budget to compute something the webview already knows.

# Scope

Rust:

- New `FileDiff::Image` variant in [`changes.rs`](../../../src-tauri/src/changes.rs),
  chosen ahead of `Binary` for a known image format (extension plus magic-byte
  sniff: PNG, JPEG, GIF, WebP, AVIF, BMP, ICO). It carries no pixels — only
  `path`, `original_path`, `change`, the media type and the byte length of each
  side, so the existing diff and warm-batch payloads stay the size they are.
- New command `read_file_image_preview(path, file_path, source)` returning the
  bytes of each side, base64-encoded, with its media type and byte length.
  `source` selects where the two sides come from:
  - working tree — base from the index/`HEAD` blob, updated side from disk;
  - commit — `commit^:file` and `commit:file`, so the History and pending-version
    surfaces get the same treatment as Changes.

  An added or deleted file returns one side and `null` for the other.
- Its own byte cap of **10 MiB per side**, separate from `MAX_DIFF_OUTPUT_BYTES`
  ([`changes.rs:24`](../../../src-tauri/src/changes.rs), 2 MiB): a legitimate photo
  is larger than any legitimate diff. Over the cap the file falls back to the
  existing "too large" presentation with the real byte counts, and the bytes are
  never read.
- SVG classification is **unchanged** — it stays `Text` with its hunks.

Frontend:

- `image` in the [`FileDiff`](../../../src/features/changes/domain.ts) union and
  `readFileImagePreview` on [`ChangesPort`](../../../src/features/changes/port.ts)
  plus [`tauriAdapter.ts`](../../../src/features/changes/tauriAdapter.ts).
- A new `ImageDiffView` rendered by
  [`DiffResultView.tsx`](../../../src/features/changes/DiffResultView.tsx) for the
  `image` kind, with three comparison modes, a checkerboard behind transparency,
  and a caption per side giving dimensions and file size, including the delta.
- For an SVG (a `text` diff whose path a `domain.ts` predicate recognizes), a
  **Drawing / Source** toggle above the diff. Drawing is the default; Source is
  the existing text diff, unchanged.
- Both preview kinds load their bytes on demand when the file is opened. The
  warm batch stays text-only.
- [`translations.ts`](../../../src/features/changes/translations.ts) in both
  languages; tests in `DiffResultView.test.tsx` and `changesDomain.test.ts`;
  Rust tests for classification and for each `source`.

# Out of scope

- **A pixel-difference or perceptual-diff mode.** GitHub's "Difference" mode
  needs an image pipeline to compute; the three modes here are pure layout.
- **Editing, exporting, opening externally, or zoom/pan.** Fit-to-panel only.
- **Preview for any other binary format** — PSD, video, fonts, PDF. They keep
  today's note. Only formats the webview decodes natively are in.
- **Metadata beyond dimensions and byte size.** No colour profile, EXIF, or
  layer information; EXIF in particular is personal data and reading it is a
  privacy decision, not a rendering one.
- **Line-level staging of an image.** Images stay whole-file, as they are.
- **Rendering Markdown, or any other "rich diff" for a text format.** Adjacent
  and tempting; a separate question with its own scope.

# Acceptance criteria

- [x] A changed PNG/JPG/GIF/WebP shows both versions in the Changes screen, with
      dimensions and file size per side.
- [x] An added image shows one side labelled as added; a deleted image shows one
      side labelled as removed; neither renders an empty frame.
- [x] The three comparison modes work, and the swipe and fade controls are
      operable from the keyboard.
- [x] Transparency reads as transparency, not as white or as the panel colour,
      in both themes.
- [x] A changed SVG opens on the drawing, and the toggle returns the exact text
      diff that exists today — hunks, search and view mode all intact.
- [x] Every preview is drawn through `<img>` with a `data:` URL. A test asserts
      that no SVG is ever inserted into the DOM as markup.
- [x] An SVG carrying `<script>` or an external `href` renders without executing
      it or making a request.
- [x] The same file opened from History or a pending version renders the same
      way as in Changes.
- [x] A side over 10 MiB falls back to the existing note with real byte counts,
      and a test asserts the bytes are never read.
- [x] The comparison modes respect the reduced-motion preference from task
      [109](109-reduce-interface-motion.md).
- [x] Both languages are complete.
- [x] `pnpm run check` passes.

# Relevant files

- [`src-tauri/src/changes.rs`](../../../src-tauri/src/changes.rs)
- [`src-tauri/src/ipc.rs`](../../../src-tauri/src/ipc.rs)
- [`src-tauri/src/tests/changes_tests.rs`](../../../src-tauri/src/tests/changes_tests.rs)
- [`src-tauri/tauri.conf.json`](../../../src-tauri/tauri.conf.json)
- [`src/features/changes/domain.ts`](../../../src/features/changes/domain.ts)
- [`src/features/changes/port.ts`](../../../src/features/changes/port.ts)
- [`src/features/changes/tauriAdapter.ts`](../../../src/features/changes/tauriAdapter.ts)
- [`src/features/changes/DiffResultView.tsx`](../../../src/features/changes/DiffResultView.tsx)
- [`src/features/changes/DiffViewSelector.tsx`](../../../src/features/changes/DiffViewSelector.tsx)
- [`src/features/changes/changes.css`](../../../src/features/changes/changes.css)
- [`src/features/changes/translations.ts`](../../../src/features/changes/translations.ts)
- [`AGENTS.md`](../../../AGENTS.md)
- [`DESIGN.md`](../../../DESIGN.md)
- [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md)

# Dependencies

None. Task [072](../0.1.0/072-harden-diff-warming-and-session-epochs.md) settled
the warm/session-epoch contract this must not disturb, and task
[109](109-reduce-interface-motion.md) settled how the comparison modes
answer a reduced-motion preference.

# Decisions

- **SVG is the reason this task exists.** Raster previews are catching up with
  every competitor; the rendered SVG is the part none of them do. If scope has
  to be cut, cut a comparison mode, not the SVG.
- **SVG stays a text diff underneath.** Rendering is a second way to *read* the
  same diff, not a new classification. Staging, discarding, search and the
  existing hunks are untouched, and a malformed SVG still has a diff to show.
- **`<img src="data:…">`, never an inline `<svg>` element.** In an `img`
  context Chromium executes no script and loads no external resource, which
  makes an untrusted SVG from a repository safe to draw. Inlining it would put
  repository content into the app's own DOM and origin. This is the single most
  important rule in the task.
- **Dimensions come from the decoded image, not from Rust.** `naturalWidth`/
  `naturalHeight` are free once the image is drawn; a Rust decoder would spend
  the binary-size budget task 018 bought. The cost is that dimensions appear
  with the image rather than before it, and that an SVG without an intrinsic
  size reports none — both acceptable.
- **Plain-language mode names, not GitHub's.** "Side by side", "Swipe" and
  "Fade". *Onion skin* is jargon borrowed from a different craft
  ([`AGENTS.md`](../../../AGENTS.md) principle 1).
- **Previews load per file, never in the warm batch.** The batch's budget is
  measured in diff text; a directory of screenshots would blow through it for
  files the user never opens.
- **The preview cap is 10 MiB per side.** Settled by the user. It is five times
  the diff cap, which is the point: the limit exists to stop a repository of
  raw camera files from moving 40 MB through IPC for a file nobody opened, not
  to police the size of design assets. Base64 inflates the payload by a third,
  so the worst case actually crossing IPC is roughly 13 MiB per side — the
  reason the cap is not higher.
- **The drawing is the default for SVG.** Settled by the user, and it matches
  what someone opens an icon change to find out. The source is one click away
  and keeps the whole existing diff, so nothing is hidden — only reordered by
  what is asked for most.

# Implementation notes

Rust, all in [`changes.rs`](../../../src-tauri/src/changes.rs): `FileDiff::Image`,
the format tables (`image_media_type_for_path`, `is_binary_image_path`,
`sniff_image_media_type`), a twenty-line `base64_encode`, and
`read_file_image_preview` with its two readers — `blob_preview_side` for a Git
object and `disk_preview_side` for the working-tree copy. One command in
[`ipc.rs`](../../../src-tauri/src/ipc.rs), one `read(...)` entry in
[`application.rs`](../../../src-tauri/src/application.rs), one line in
[`lib.rs`](../../../src-tauri/src/lib.rs).

Frontend: [`pictureDiff.tsx`](../../../src/features/changes/pictureDiff.tsx) is new
and owns everything about a changed picture — the read, the comparison mode and
the two parts that draw it. It is named for what it holds rather than for a
component: once the controls moved into the toolbar it exports a hook and two
pieces, not a view. A surface calls `usePictureDiff`, puts
`PictureDiffControls` in its own toolbar and lets
[`DiffResultView.tsx`](../../../src/features/changes/DiffResultView.tsx) render
`PictureDiffBody` in the diff pane; the text path is untouched, and an SVG
showing its source renders exactly what it rendered before.
[`DiffOptionPicker.tsx`](../../../src/features/changes/DiffOptionPicker.tsx) is the
one picker all of it shares with `DiffViewSelector`. Each surface supplies its
own loader through its own port: Changes compares the working tree, History and
Overview's pending versions compare a saved version with its parent.

Three things turned out differently from the plan, all recorded here rather
than done quietly:

- **`FileDiff::Image` carries no media type and no byte lengths**, only what
  `Binary` carried. The plan had it carrying both, which reads well and costs a
  `git cat-file` per image during classification — and classification runs for
  every changed file in the warm batch. Sizes and media type now come back with
  the picture, from the command that was going to read them anyway.
- **An SVG's drawing goes through the same command as a photograph.** The plan
  assumed the frontend would draw the file it already had; it does not have it
  (a text diff carries changed lines, not the document). Admitting SVG to
  `image_media_type_for_path` while excluding it from `is_binary_image_path`
  gave both halves — the ordinary text classification, and one preview path for
  every format.
- **`sniff_image_media_type` recognizes SVG by shape**, not by signature: it
  must begin like XML or SVG and carry an `<svg` tag in its first 4 KB. SVG has
  no magic number and the media type in a `data:` URL has to be right.

The IPC contract is checked from both sides, so
[`025-ipc-contract.json`](../../../docs/architecture/025-ipc-contract.json) and the
two snapshots that guard it (`ipc::contract_tests` and
[`ipcContract.test.ts`](../../../src/architecture/ipcContract.test.ts)) were part
of the change, not an afterthought.

Two things came back from looking at it in the real app:

- **The fields crossed IPC in snake_case.** `#[serde(rename_all)]` on an enum
  renames its *variants*, not the fields of its struct variants, so the
  frontend read `undefined` for `mediaType` and `byteLength`: a PNG was drawn
  from a `data:undefined;base64,…` URL that Chromium sniffed anyway, an SVG
  from one it refused, and every size printed "NaN MB". Each variant now
  renames its own fields, and
  `ipc::contract_tests::representative_response_error_and_event_serialization_are_stable`
  pins the JSON shape so the next tagged enum cannot repeat it.
- **The controls are the reading-mode picker, in its place.** The user's call,
  and the right one: the toolbar row already answers "how am I looking at this
  file", and a picture's answer belongs in that row rather than in one of its
  own. [`DiffOptionPicker.tsx`](../../../src/features/changes/DiffOptionPicker.tsx)
  is the control, extracted from `DiffViewSelector` and now shared by it, by
  the comparison modes and by Drawing/Source. `usePictureDiff` owns the state
  because it is read in two places at once — the surface's toolbar and the diff
  body far below it — so a picture reads `View: [Side by side]`, an SVG
  `View: [Drawing] [Side by side]`, and an SVG showing its source gets the
  ordinary reading-mode picker back alongside. A picture with one version has
  nothing to choose, so `hasControls` is false and the row keeps its rule but
  loses its label — the row itself is what holds this pane's top edge level
  with the file list's search strip, so it stays. Overview's pending versions has no toolbar of its own,
  so there the same controls sit directly above the picture.

The swipe divider was measured against the wrong box. `clip-path`'s inset is a
percentage of the layer being clipped; the line's `left` is a percentage of its
containing block, which was the frame — wider by its padding and by whatever
room a centred picture left on either side, so the rule sat behind the cut. The
stage is now its own element, sized by the pictures rather than stretched to the
frame, with both layers filling it: one box, one percentage, and the line lands
on the cut to the sub-pixel (verified at several positions in the browser). It
is also centred on the boundary rather than starting at it, so 2px of rule does
not read as 2px of the new version leaking across.

Image sizing now lives with the picture diff in
[`pictureDiff.tsx`](../../../src/features/changes/pictureDiff.tsx), which replaced
the overview section this task first built it in. Every non-text diff was once
sized at a flat 120px, which is a slot, not a viewport; the preview is now
contained and capped at 320px in `changes.css`.

No CSP or capability change was needed: `img-src` already allowed `data:`.

The only motion in the feature is a 120 ms opacity transition on the fade
layer, which the app-wide `:root[data-reduced-motion="true"]` rule removes.

Known limitation worth stating: an SVG that paints with `currentColor` has no
inherited colour inside an `<img>`, so it draws in the engine's default ink
(black). That is correct rendering of an isolated document, and it is visible
in the sample change left in the working tree — the mark's before side is
black, its after side green.

## What a review pass caught

A deliberate read of the whole change, after it was working, found seven things.
Five were real and are fixed here; two were latent and are closed rather than
left as traps.

- **The working-tree preview followed symlinks out of the project.**
  `disk_preview_side` joined and read. `read_file_lines` in the same module
  resolves both ends and checks containment for exactly this reason, with a
  comment saying so. A repository could have put any picture on the user's disk
  on screen by naming a link after one of its own files. Fixed, and covered by
  the same skip-on-Windows symlink test the expand path uses.
- **An unreadable picture was reported as a deleted one.** `None` means "this
  side does not exist", which the UI states as Removed — and both readers
  returned it for failures too. A locked or unreadable file now raises an
  error the dialog can show instead of a sentence that is not true.
- **Overview's pending-version box clipped the pictures.** It is capped at
  `min(300px, 38vh)` and did not scroll, so on a short window the captions were
  simply unreachable. The box is a flex column now and the picture scrolls
  inside it — which also fixes the same clipping for long *text* diffs, which
  predates this task.
- **History's diff pane clipped them too.** The text diff survives because
  `.diff-code` is its own scroller; a picture had none, and the pane is
  `overflow: hidden`.
- **`looks_like_svg` matched `<!DOCTYPE` case-sensitively**, so a valid SVG
  opening with a lowercase doctype was called "not a picture GitOdile can
  draw".
- **The History loader fabricated an empty commit-ish** when no version was
  selected. `validate_commit_ish` rejects it, so nothing was wrong today — but
  an empty commit makes `:path`, which Git resolves to the *index*, so it now
  refuses explicitly rather than relying on a guard in another language.
- **The refetch key omitted the revision being compared.** `usePictureDiff`
  keyed on the path alone; the commit lived in a ref that deliberately does not
  retrigger. No host could reach it — History clears its diff between versions
  — but the invariant lived in someone else's module. `sourceKey` is now a
  required argument, so the same `logo.png` in two saved versions is two
  different pictures by construction.

# Validation

- `pnpm run check` — passes (docs, dependency-cruiser, `tsc -b`, 676 frontend
  tests across 73 files, `vite build`, `cargo fmt --check`, `cargo clippy -D
  warnings`, 333 Rust tests). Frontend: 676 tests across 73 files.
- Looked at in the running application by the user, which is where the
  snake_case defect and the control-style decision came from; both are fixed
  above and re-checked.
- Looked at in a browser against the real components and the real stylesheet,
  through a temporary harness that stubbed only the preview loader (deleted
  afterwards): side by side, swipe and fade for a raster pair; the Drawing and
  Source halves of an SVG change; light and dark; transparency reading as
  transparency in both.
- The user exercised Changes and History in the desktop application: the
  picture views, the pickers, and both comparison modes behave there.
- Overview's pending-version box and History's squeezed diff pane were measured
  in the browser after the layout fixes: nothing clipped, every caption inside
  its visible box, and the picture scrolling when the box is smaller than it.
