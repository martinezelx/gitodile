# GitOdile Design Direction

This document owns GitOdile's visual and interaction direction. See
[`docs/PRODUCT_STRATEGY.md`](docs/PRODUCT_STRATEGY.md) for the product thesis,
audience, positioning, and detailed competitive context.

## Before designing a screen, dialog or panel

The app's current look is the specification: a new surface must read as part
of the app the reader already knows, not as a fresh design. Before writing any
markup or CSS:

1. **Find the closest existing equivalent** — a dialog of the same size and
   kind, a screen with the same layout, a list with the same rows — and match
   it. The style gallery (`pnpm run dev`, then `/gallery.html`) draws every
   shared primitive and state in every theme. When nothing equivalent exists,
   say so in the task before inventing.
2. **Reuse the shared primitives** exported from `src/shared/ui/index.ts`:
   `Dialog` with `DialogFacts` and `DialogBanner` (§ Dialogs), `useToast`,
   `SearchBox`, `RefreshIconButton`, `LoadingPlaceholder`/`TextPlaceholder`,
   `LoadingBar`, `FilterPanel`, `ContextMenuSurface`, `DateField`, and the
   classes in `src/shared/ui/primitives.css` (`primary-button`,
   `secondary-button`, `danger-button`, `ghost-button`, `app-checkbox`,
   `choice-list`, `empty-state`, `text-placeholder`). A feature restyles none
   of them.
3. **Take every value from a token** (§ Design tokens): colour, radius by role
   (§ Shape), control height (§ Size), type size, weight, leading and tracking
   (§ Typography), spacing and motion. A new token, a new dialog width, a new
   radius, a new material or a new pattern is a change to this document, made
   in the same change and argued there — never a local exception.
4. **Follow the structure rules**: one frame, one sheet per screen, regions
   not cards, and only what floats casts a shadow (§ Visual character);
   loading, empty, error and success states as § Core screens describes them;
   copy as § Content design and the vocabulary in `AGENTS.md` describe it, in
   English and Spanish.
5. **Check it running**, in a light and a dark theme, beside the existing
   equivalent from step 1, with the keyboard and with reduced motion. Tests do
   not show a look. A new shared primitive or state is added to the gallery
   (`src/dev/gallery/Gallery.tsx`) in the same change.

`pnpm run check` enforces part of this: `src/architecture/styleComposition.test.ts`
fails on radii, font sizes, weights, leading, tracking and button sizes off
their scales, on shadows or borders on the sheet's regions, on a cast shadow
that is not an elevation token, on stacking off the layer scale, on an easing
curve or transition length off the motion tokens, and on a removed focus
outline with nothing in its place, on spacing off the 4px grid, on an icon
or a square icon button sized by a number instead of a role, on a tint mixed
at a strength of its own and on a disabled control dimmed by its own opacity. `src/architecture/themeContrast.test.ts`
checks contrast in every theme. Colour choice and layout are not guarded: they
rely on steps 1–5.

## Design goal

GitOdile should make a complex technical system feel calm, understandable, and safe. The interface must be modern and distinctive without sacrificing readability or looking like a decorative concept app.

The intended feeling is:

- friendly but professional;
- lightweight but capable;
- contemporary but durable;
- reassuring rather than intimidating.

## Visual character

Settled direction: **Friendly Sheet** ([ADR 0032](docs/adr/0032-one-sheet-per-screen.md)). The window is a frame and each screen's content is one sheet on it; inside the sheet the content is laid out as regions, and only what floats casts a shadow. It keeps the material of **Friendly Card**, the direction it replaces — opaque stone neutrals, the subtle border, the 18px surface radius, capsules and circles by role — which was chosen after benchmarking against Sublime Merge/Fork (dense, flat, expert-only), Linear/Raycast (flat, minimal, colder), and GitKraken/Tower (moderate radius, opaque cards, soft shadow) for its "polished but not scary" balance, and because shadows age better than a glass-heavy look. What Friendly Card repeated on three to five cards per screen, Friendly Sheet wears once: the frame-and-sheet structure comes from Arc and Dia, everything inside it is GitOdile's own.

Four rules hold it together, on every screen and in every overlay:

1. **One frame.** The titlebar and the rail are a flat plane on `--surface-app`: no fill, no tint, no gradient, no translucency.
2. **One sheet per screen.** The content sits on a single sheet with the same 16px of frame on all four sides. Home and Console are the documented exceptions: Home's launcher floats alone on the plane, Console is a terminal across the workspace.
3. **Regions, not cards.** Inside the sheet, panels and bands meet on 1px hairlines and wear no border, shadow or radius of their own. A card *inside* a region — a fact, a section, an in-screen notice — is `--surface-card` with the subtle border and no shadow.
4. **Only what floats casts a shadow.** Menus, popovers, the palette, toasts and dialogs are `--surface-raised` with `--shadow-lg` (a toast `--shadow-md`; the palette grown out of the status bar's field `--shadow-up`, so its shadow is not cut where it meets the field). A small object lifted inside a region (an empty state's glyph tile) may carry `--shadow-sm`; a resting surface never does.

The visual language uses:

- fully rounded controls — a capsule for anything on one line, a circle for anything square — over the 18px sheet, dialogs and inner cards and 10px rows, with circles for avatars and glyph tiles. Rounded enough to feel approachable, not so large it reads as a decorative concept app. The tiers are roles, not sizes; see Shape;
- **opaque panels**, not translucent glass — depth comes from `--shadow-sm/md/lg`, not `backdrop-filter` blur;
- layered surfaces distinguished by a subtle tone shift and a hairline inside the sheet, and by shadow only for what floats, never by transparency;
- **one sheet per screen** — the detail of rules 1–3 above. The titlebar and the rail are the frame, a flat plane on `--surface-app`; the content column is a single sheet — `--surface-panel` with `--border-subtle`, at `--radius-surface` — keeping the same 16px of frame (`--space-4`) on all four sides — under the titlebar, beside the rail and to the window's edges — so it floats evenly, and lifted with `--shadow-md` since it is the one object on the plane. The frame takes no tint, gradient or translucency. What the screens lay on the sheet are *regions*, not cards: Overview's header, next step and body are three bands, and the panes of Changes, History and Branches run edge to edge; regions meet on a 1px `--border-subtle` hairline and wear no border, shadow or radius of their own. The status bar is the sheet's foot. A card *inside* a region (a History overview section, a Branches fact card) keeps `--surface-card`. `--surface-raised` is for what floats (menus, popovers, dialogs, a badge over an avatar), and only what floats casts a shadow inside the window: `--shadow-lg`. A screen does not pick another material for itself, because a different edge reads as a different app the moment the reader switches screens. Console and Home have no sheet: Console is a terminal across the workspace, and Home's launcher is the one object on its screen, so it floats on the plane with its own lift (`--surface-raised`, `--shadow-md`) rather than sitting on a sheet round a single card. Borders are not divider rules *inside* a list of rows (settings rows, nav groups); separate those with spacing alone, which reads cleaner than a hairline between every item. The hairline divides *regions*, never rows. The one exception is a **bordered list whose rows are reordered or scanned densely** — Settings' Navigation and Notifications lists — which may divide its own rows; every other list, in a dialog too (the versions a publish sends, what a get brings, What's new's earlier releases), separates its rows with space;
- generous spacing around primary actions;
- compact spacing in file lists and diffs;
- a crocodile mascot used selectively.

Blur/translucency is not the default depth mechanism for GitOdile chrome. Reserve it, if used at all, for genuinely transient overlays (a modal scrim) — never for a panel that sits on screen the whole session. Code, diffs, file lists, conflict editors, forms, and long-form content must sit on fully opaque surfaces.

## Layout concept

The main desktop window should broadly support:

1. **Top bar** — implemented as a custom titlebar rather than a traditional File/Edit/View menu bar, which reads as legacy Win32/desktop-app chrome:
   - the overflow menu starts with Home (Inicio), a quiet way to the project-opening screen while projects remain open. The command palette offers the same destination, and so does the status bar's project popup, whose foot ends in "All in Home" (task 189): Home is the view of every project, so it sits with the projects rather than among the rail's destinations, which all belong to the active one. The titlebar and rail add no permanent Projects button.
   - the overflow menu's rules separate four groups, in the order they are reached for: the project (Home, then open, create, clone and close), setting the app up (Settings, Keyboard shortcuts), the app itself (the update entry, About GitOdile), and the way out when something is wrong (Report an issue, Reload window). Reload once sat beside Settings, pairing a daily entry with a rare recovery one; it belongs with the problem report. Entries that open a dialog asking for more end in an ellipsis, a shortcut the app owns is shown as quiet text at the row's end (`Ctrl+,` beside Settings), and no glyph appears twice in the menu. Opening a project is `FolderOpen` and creating one `FolderPlus` wherever either appears — Home, this menu, the project popup's add rows and the create dialog itself — and the menus spell the actions the same way, ellipsis included.
   - no brand: the titlebar is controls only and starts with the overflow menu, centred over the rail's icon column so the titlebar and the rail share one vertical axis (with no rail, it sits at the plain edge inset). It once carried the app mark in the corner (later the full mascot); a colour illustration in a row of line icons drew the eye to a spot that does nothing, and the operating system already shows the app icon. The mascot lives in the brand moments instead (see "Brand and mascot").
   - left: the rail collapse control and a compact overflow menu. The palette's trigger is not here: it is the field at the foot of the strip (see Status bar), and the shortcut (`Ctrl`/`Cmd`+`K`) reaches it from anywhere.
   - the collapse control doubles as a jump menu: while the rail is collapsed, resting on it opens the rail's destinations as a short menu hanging off the button, so a destination can be reached without expanding and re-collapsing the rail around a single click. It carries the rail's two groups — destinations and the app-level utilities. Projects are not in it: they are the status bar's, which stays on screen while the rail is collapsed (task 189). It is a menu, not a miniature rail — same furniture as every other flyout in the app.
   - the theme toggle lives in the rail's foot (task 189). The titlebar shows its copy beside Back/Forward only while the rail is not there to hold it — collapsed, or gone in the compact layout under 800px — so the toggle is reachable in every layout and never drawn twice.
   - contextual history: Back/Forward stay together with the command controls. They remain visibly disabled until there is history to traverse, then become available without moving the surrounding chrome.
   - center: the remaining native drag region, including double-click maximize/restore.
   - right: window controls (minimize/maximize/close), styled as small rounded buttons inset from the edge rather than full-height square hit targets, so they read as part of the same rounded-corner system as the rest of the UI instead of bolted-on OS chrome.
   - macOS is the one exception to this layout ([ADR 0037](docs/adr/0037-native-window-chrome-on-macos.md)). The system draws its traffic lights over the titlebar's left corner, and the titlebar reserves their width (except in full screen, where macOS hides them). There are no custom window controls and no overflow menu: its entries live in the macOS menu bar, under GitOdile (About, the update entry, Settings…), File (Home and the project actions), View (sidebar, Back/Forward, Reload window), and Help (Keyboard shortcuts, What's new, Report an issue), beside the standard Edit and Window menus. The titlebar keeps the sidebar toggle, Back/Forward and the bell. Windows and Linux keep the layout above. An entry added to the overflow menu is added to `planAppMenu` too.
   - between the drag region and the window controls: the notification bell — the
     inbox for "what happened while you were elsewhere", which desktop apps keep
     in the window furniture rather than in a workspace panel. It carries no
     number: a count painted over a 16px glyph had no room and, coloured
     `--status-danger`, said "something is wrong" when it meant "there is
     something new". An 8px accent dot marks unread and breathes three times on
     an arrival, then settles; the exact count is the button's accessible name
     and the panel's rows. The panel has no visible title — the bell already
     names it — and it is not a menu: each entry is its own card
     (`--surface-card`), an unread one carries the dot and a heavier title —
     no wash and no tinted edge, which under the ink accent only darkened the
     card — its glyph takes the tone of the dialog it opens (§ Glyph tones),
     its action is the shared small secondary button, and a per-row trash sits in the
     bottom-right corner, uncovered only while its row is pointed at or
     focused, so the destructive control is deliberate and the dot never
     competes for the corner. The footer keeps settings on the left and the
     two inbox actions on the right, all as icon controls with tooltips.
     Clear-all is disabled while the list is empty. A double-check glyph with
     a "Mark all as read" tooltip acknowledges without deleting and is disabled
     when nothing is unread. Each card has an always-reachable
     read/unread control beside its dismiss control in the same action row, with
     matching 28px targets and 14px glyphs centred on one horizontal axis.
     Both controls appear on row hover or keyboard focus, reserve their space
     while hidden, and stay visible on devices without hover.
     The review action sits at the left of that row. Opening, hovering,
     scrolling and closing never acknowledge a notice. A review acknowledges
     only its own notice after the destination opens; unavailable projects
     leave it unread and explain why. Pressing outside closes the panel,
     including in the titlebar's native window-drag region. Row marks always reflect live state,
     including arrivals while open, and removing a row keeps keyboard focus
     inside the panel. An automatic check repeating the same news keeps its
     card's identity, position and arrival time, preserving keyboard focus;
     changed news arrives at the top. Read state survives restarts in a local
     bounded inbox of 50 entries (oldest evicted first). Removing or reading an update notice
     does not hide the available update in Settings or re-alert that same
     acknowledged version. Update cards name the historical version and open
     the updater's current state. All notifications remain silent; sound is
     deferred. Storage failures are disclosed within the panel without adding
     another notification. When
     notifications are off, the panel says so and offers the same switch
     Settings uses, bound to the same preference, so they can be turned back on
     without leaving the window. The switch fades out once notifications are
     back on, but its place is held, so the empty block never resizes under the
     pointer. The long explanation of what
     gets reported stays in Settings, where it is the point rather than a
     paragraph under an empty inbox. There it is one group on one icon column:
     the switch leads with the bell, and the events hang under its label as a
     bordered list ("You'll be told when…"), each with the icon its
     notification wears and no control of its own, so they read as what the
     switch covers rather than as settings missing a switch. A kind recorded as
     already read carries a "Silent" tag instead of a sentence explaining it.
     With notifications off the bell is struck through and the list stays, in
     the secondary ink and down to its names, so what turning it on gives is
     still in view.

2. **Navigation rail** — a 64px column with no surface of its own: no fill, no
   border, no shadow. The window chrome (titlebar, rail) is one continuous
   plane, and only *content* sits on top of it, on the screen's one sheet —
   the status bar included, as the sheet's foot, since it holds controls
   rather than a window title. Each
   destination is an icon in a 40px circle with its name underneath; the
   active state fills that circle, never the whole cell, so a two-line label
   like "Iniciar sesión" does not make its neighbour look shorter.

   The width is derived, not chosen. 64px is 8px of padding either side of the
   widest thing the column must hold, which is the longest unbreakable
   *destination* label across every shipped language — "Overview", at 46.3px.
   Chromium ships no Spanish hyphenation dictionary, so a narrower column can
   only break such a word mid-syllable, which is why Recovery is "Rescate" in
   Spanish and not "Recuperación" (66.7px). Settings was renamed to "Ajustes"
   for the same reason while the utilities were still captioned; that
   constraint is gone now that they are not, and the shorter name was kept on
   its own merits. **Re-measure before narrowing, and treat
   a new long destination name as a width decision, not just a copy one.**
   Branches was rechecked on Windows at about 44px in the 48px content
   column; the renamed destination fits the existing 64px rail.

   Destination names are one word. The **Branches / Ramas** destination and
   its explanations use the same noun: **branch / rama**, including simple
   mode. The sync comparison uses "Current branch" and "Remote branch".
   Git's familiar noun connects the app to other tools; the action still
   explains what changes and how work is protected. See
   [ADR 0035](docs/adr/0035-use-branches-as-the-product-vocabulary.md).

   Navigation Settings may switch to icons only: every caption disappears —
   destinations and utilities alike, since a rail that labels one and not the
   other reads as an accident — and the column keeps its 64px. Narrowing it to
   the 40px icon circle plus padding would move the workspace's edge every
   time the setting changes. The 40px pointer target and accessible name remain.
   - Overview, Work, Branches, and Recovery keep their order. Work is what has
     changed and what has been saved — one loop, one screen, with Changes and
     History as its two tabs (they were neighbouring screens until task 126,
     and by then shared everything but the rail entry: one strip per panel,
     one list column, one diff toolbar, one find). The destination is "Work"
     rather than "Workspace": it names the loop of editing and saving, while
     workspace describes an actual workspace, never a synonym for a branch. Branches
     follows: switching a branch is a deliberate move between
     pieces of work rather than a step in that loop. Navigation Settings
     controls which stay in the rail; deselected and height-overflowed
     destinations remain reachable in More, in registry order. Recovery stays
     disabled and marked "Coming soon" until its screen exists;
   - "More" is always the final destination tile. As the window loses height,
     the trailing destinations move into its menu in order instead of making
     the narrow rail scroll. The menu always ends after a separator with
     "Customize navigation bar", which opens the dedicated Settings section.
     There the destinations are the same bordered list as Notifications: each
     row reads grip, icon, name over a one-line plain-language description of
     the section, precise move arrows, then its switch. The list spans the
     preferences column: the description is what fills it, so the width carries
     content instead of a stretched gap between a short name and its switch.
     The switch is named for what it does ("Show Overview in the sidebar"), and
     its "on" fill uses the secondary ink so five switches do not outweigh the
     names. "Restore default" in the group header returns membership and order
     to the registry's and leaves the appearance alone. The appearance choices
     span the column too, as two wide cards side by side (stacking when a card
     would squeeze its copy): a miniature on the left, drawn from the user's own
     visible sections in their order, and the name, check and a short trade-off
     on the right. The selected card takes a quiet fill and its filled check
     rather than the theme picker's accent ring. Arrows are hidden at rest and
     appear on the row's hover or focus (always shown without hover); their
     space is always reserved, and the grip reorders from the keyboard. A
     destination switched off keeps its row at full contrast with an "In More"
     tag, so the list never changes height and its place in the order stays
     visible;
   - the rail holds no project (task 189). Which project is open, and the
     way to change it, is the status bar's project segment, which sits at the
     foot of every project screen; Home lists every project itself. The rail
     used to carry the active project as a square chip with a searchable
     switcher and a "+" beside it; with the status bar naming the project and
     its branch in one place, the chip only said the same thing twice;
   - at the foot: the theme toggle, then Settings, then the account button.
     These are the app's own controls, so the theme sits with them rather than
     in the titlebar's navigation: one round button that says the change it
     will make — the moon to go dark, the sun to go light, the monitor to hand
     a community theme back to the device;
   - only destinations are captioned. The controls below the rule — theme,
     Settings, account — carry no visible label in either display mode: they
     are stable shapes, and captioning controls that never change cost a line
     of text each and turned the column into a wall of words. Their accessible
     names stay on the buttons and concise localized tooltips give pointer and
     keyboard users the same names. The reserved account control states that
     sign-in is coming soon without implying an account is required;
   - unavailable destinations remain focusable but guarded from activation so
     their localized reason is reachable by pointer, keyboard and screen
     reader. In a text menu, show that reason directly rather than requiring a
     tooltip to explain a disabled row;
   - hover confirms interactivity with a stable neutral fill and foreground
     change. It never lifts or enlarges rail furniture, and never borrows the
     accent-tinted selected surface. Accent fill and green iconography remain
     reserved for the active destination or selected control;
   - nothing is drawn behind the foot (task 189). A faint pill of
     `--surface-hover` once grouped the square project chip with the round
     utilities; with the project in the status bar the foot is three filled
     circles with no caption, and that shape already reads as one group apart
     from the captioned, unfilled destinations — also when a short window
     folds destinations into More and closes the free height above. The pill
     was a second fill behind fills of their own. A full-width rule and an
     18×3px capsule were tried before it and dropped: strokes in a column of
     rounded fills, and the capsule read as a minus button. The circles wear
     `--surface-hover` at rest, so hovering one steps up to `--surface-active`,
     and its glyph says what it does once and rests there: the gear turns 60°,
     the sun 45°, the moon tips back 18°, over 180ms
     on an ease-in-out (`cubic-bezier(0.45, 0, 0.25, 1)`): the rail icons'
     sharp ease-out spent the turn in the first 40ms and read as a jump. A disabled control stays still (including the account
     placeholder in published builds), and reduced motion — the system's or the app's —
     leaves every glyph where it is. Nothing loops;
   - the account control uses a plain person glyph before sign-in and the
     person's avatar afterwards. The button's circular surface supplies its
     frame. Hover changes background and ink only; the person/avatar does not
     rotate or slide;
   - the rail can be collapsed entirely (`Ctrl`/`Cmd`+`B`, or the titlebar
     control), giving the window over to content. Collapsed means `display:
     none`, never a zero width or a transparent column: a rail still in the tab
     order is a trap for keyboard and screen-reader users. The state persists
     across sessions like every other chrome preference.

3. **Status bar** — a 44px strip at the foot of the sheet on every project
   screen, Overview included: no card of its own, only a hairline above it,
   with the sheet's own bottom corners. Home and Console do not carry it,
   because each ends in a status line of its own — Home's "This computer" row
   in the launcher, which is about the machine, and Console's terminal status
   line, which repeats the project facts read-only. Each of those lines
   carries the app search at its own scale — the field the palette deploys
   from, since the strip's is not there. On Home the results take that
   field's width. Inside it the strip is three
   columns — where you are, the field, the remote — so the field sits at the
   strip's centre at any width rather than pushed around by how long the names
   happen to be. It reports what is true of the project right now: which
   project, its branch, unsaved work, and the remote's relation. It reports no
   version of its own: a version is a fact about the app, not about the project
   the reader is working on, and the strip exists to be believed about the
   project. Every fact is a glyph and words with no fill, and the one shape a
   state earns is the sync action's — the whole right block filled, and nothing
   else on the strip.

   The strip is two blocks of the *same object* and a field between them: the
   left block says where you are and the right one says what is happening to
   it. A block is segments of one size, weight and hover, with 4px of air
   between them and no mark: the left block's project and branch each wear a
   glyph, a name and a chevron, so they read as two controls; the right one is
   a fact and the check that renews it, told apart by their glyphs. Neither
   uses a vertical rule, which read as a terminal's `|` rather than as a
   sentence, and the left one no longer uses the slash that once joined
   `project / branch`: beside branch names that carry their own slashes
   (`release/0.3.1`) it was one more mark to read (task 189).

   The project's name and the branch's name are the left block, with no words in
   front of them: the project's avatar and name, then the branch's glyph and
   name, each ending in the chevron of a popup that opens upwards. Both sit in the same sans at
   the name weight — the branch drops the mono it wears elsewhere, since a
   typeface change inside one block split it in two. The name is what keeps the
   strip saying something once the reader has left Overview, and both truncate
   rather than wrap. The project segment is the one place to change projects
   (task 189): its popup is the branch popup's twin — a fixed box with a search,
   rows of an avatar, the name and its branch, a star that waits for the pointer
   and a chevron that is always there. It leads with the active project, its
   path, and three icon buttons for what is done to it — its settings, its
   folder, closing it — then lists the other open projects (favourites first,
   each with its unsaved, operation or error mark) and the recently closed
   ones, which reopen from there. A row's chevron shows that project's actions
   in place of the list (go to it, settings, show in folder, copy its path,
   close it), with a way back, the way a branch's do; "Add project" docks the
   three ways to add one at the foot in place of the foot, and "All in Home"
   leaves for Home. While a blocking dialog is open, switching, reopening and
   closing are disabled and say why; the active project's settings and folder
   stay available. Each segment's mark speaks for that segment alone: the
   project's for the active project, the branch's for the branch — another
   project's state stays on its popup row. The project's mark sits at the
   avatar's corner, one at a time and the most urgent first, told apart by
   shape as well as tone so it reads without colour: the popup rows' alert
   glyph in the danger tone for something to resolve (an operation that
   failed or ended uncertain, overlapping changes, a history that could not be
   read), then a ring turning in the quiet ink while an operation runs. A
   missing Git identity is not one of them yet: the strip only knows the
   global one, and a project can set its own. Its sentence joins the
   trigger's tooltip and name. A mark that
   arrives breathes once (`.attention-breathe`); the turning ring does not,
   since it already moves. Closing the active project goes to
   Home with no project active (task 184): the app never moves the reader
   into another repository on its own. Favourites are stored against the
   canonical worktree root and sort display only, so Ctrl/Cmd+Tab still cycles
   the session order. Unsaved work rides
   the branch it belongs to: a dot after the branch's name, the way an editor marks
   an unsaved tab, in the warning tone the project popup already gives unsaved
   work; a tree that could not be read takes the alert glyph in the danger
   tone instead, the project mark's shape for something to resolve, so the
   two states differ in shape and not only in colour. Either breathes once
   when it arrives;
   while the tree is being read the branch glyph turns into the spinner. How many
   files and how many lines is not the strip's to say: the sentence ("28 unsaved
   changes") is the trigger's tooltip and the screen reader's, and Overview's
   band and Changes give the numbers in full. The strip draws no `+N −N`: the
   diff's red was the one red in the window and read as an error, and its green
   competed with the remote's.

   The remote fact is one word in the strip's quiet ink, amber when the reader
   should doubt or act — and *how* it is known (a saved snapshot, when it was
   checked) is the tooltip, not a second item; when a result is stale or a
   check failed, the strip must not read as current: a failed check says
   "Check failed", and an answer the reader's own latest change has overtaken
   says "Check again" — the one thing left to do — while the known state and
   the exact time move into the tooltip, so the doubt is never a vague
   judgement about the project itself. "Up to
   date" is the calm state and is not restated: its cloud (`CloudCheck`) and
   its age ("3 min ago") say it, with the word kept for the screen reader. A
   project with no remote is a fact, not a problem, and stays quiet. A branch
   whose remote branch was deleted — usually after its pull request was
   merged — reads "No longer on the remote" in amber, never "Check failed":
   Overview's card names it and offers switching to the main branch, publishing
   again, or no longer following the remote, pressing none of them for the
   reader; Branches marks the branch
   "Remote branch deleted"; History says its versions "Was on" the remote
   and Overview's timeline "Was published"; Get project changes stops with nothing to get; and Publish asks
   before it creates the branch again, with "Recreate and publish". A branch
   with no publish destination yet is offered "Publish this branch" — on the
   card and as the strip's action — since publishing is how it gets one. The
   fact is never the check: the block's second segment is, visible in every
   state — with a sync action too, where knowing whether the remote moved
   matters most, and as the strip's only way to ask when automatic checks are
   set to manual. The remote block is the project block's twin: the fact and
   the check are two segments split by the same hairline, at the same size and
   weight. The fact is not a control while nothing can be done with it; when a
   current relation calls for a sync it becomes that verb as a button and the
   whole block fills, so the shape — not only the words — says there is
   something to do. While a check runs the fact keeps its last words
   ("Publish 12 versions", "3 min ago") in the quiet ink with the glyph turned
   spinner — one spinner, the check goes quiet — and "Checking the remote…" is
   the tooltip's and the screen reader's, the visible words only when nothing is
   known yet. The block sits at the right end, opposite where you are, since its
   state belongs to that branch — the way an editor's status bar puts sync beside
   the branch — so the strip reads as two equal halves. A fact that turned into a button under the pointer was tried
   and dropped: nothing showed it could be pressed, touch has no hover, and it
   vanished whenever the sync action took its place.
   When the relation calls for a sync and is known-current, that same cloud
   becomes the one sync action — GitHub Desktop's Fetch/Pull/Push in the
   app's words: ahead is "Publish 3 versions" (`CloudUpload`), behind is "Get
   2 versions" (`CloudDownload`), and both sides moved is "Get and publish"
   (`CloudSync`), each opening the same previewed dialog Overview's card does.
   It wears the block's fill with only its glyph in the accent: the shape says
   it is a button and one green mark is enough to find it, so it never competes
   with the screen's primary action (Overview's "Save version"). Its tooltip
   adds when it was checked. A stale, failed or still-loading answer
   keeps the cloud a plain fact — it is not a state to act from. The
   branch is also the app's one global branch control: its dropdown
   switches, creates — in place, see Branches — and hands off to the Branches
   screen. No screen adds a
   second selector to its own header: two controls answering one question in
   one window is how a reader stops trusting either.
   - it is a card on the content's edges (see above), at the control radius
     because the 18px surface radius on a 44px strip reads as a pill;
   - it shares the workspace's horizontal inset through a variable rather than
     repeating the number, so its text sits in the same column as the content
     above it at every breakpoint;
   - no rules *between* its items, only inside them: the one hairline a block
     owns sits between its two segments — 1px, 16px tall — and the strip's own
     12px gap separates the left block, the field and the right block. Within a
     segment 4px binds a glyph to its words, so the names keep the room, and the workspace's own bottom
     padding leaves the band between the last card and this line of text;
   - the field is the middle column, a third of the window, at least 240px and
     at most 430px wide — in a narrower window it gives way before the project
     and branch names do, which read in full down to about 1,100px — and
     it is the app's search: a real input, 32px tall, with the search glyph
     beside it, so a search starts from anywhere without leaving the screen.
     At rest it is already the object it opens into, closed — what floats'
     surface, the subtle edge and `--shadow-sm` — and it spells no shortcut:
     `⌘K` / `Ctrl+K` lives in the shortcuts list and the palette, not on the
     strip. The two blocks never outgrow their columns: they give way with an
     ellipsis rather than sliding under the field. In a window of 1000px or
     less the field folds to its glyph, a 32px circle in the same closed
     material, so the blocks keep readable names; a press or the shortcut
     unfolds it centred over the strip, up to 340px, and the results grow out
     of it as usual. The field owns the query and the
     keyboard — `↑`/`↓` walk the results (the list follows the chosen row into
     view), `↵` runs the chosen one, `Esc` puts
     them away — and the focus never leaves it, so there is nothing to trap and
     nothing to give back. It stays present with no project open, since search
     is global.
     **The results grow out of this field** as one object (Friendly Sheet):
     the panel takes the field's width and sits on its top edge, square below,
     and the open field becomes its foot — the same surface, an edge mixed
     from the accent round the whole object and a soft halo outside it. Both
     halves share one corner radius, half the field's height: at rest the
     field is that pill (16px on the strip, 14px on Home), and opening only
     squares its two top corners. The halo is drawn once — the field's stops
     at the seam where the panel's ends — the panel casts `--shadow-up` so no
     shadow is cut flat at the seam, and an inner `--border-divider` line,
     14px clear of the edges, marks where the query begins. Focused with the
     results put away, the field keeps the object's edge and halo rather than
     the ink focus ring, so closing changes only its top corners. The
     rows wear the app's shapes: a sentence-case label per kind of work,
     capsule rows, each action's glyph in a circle — the one the rail gives
     the same screen, so no two destinations share one — the shortcut on a
     row that has one, and the chosen row showing `↵` as a small key, like
     the footer's, instead of a list of keys at the foot. A field narrower than 320px cannot carry those rows, so it gets a
     floating panel of its own instead, at least 320px wide, eight pixels
     above it and kept 12px inside the window. Console's results stay its
     terminal pane, with the keys at their foot. Grown out of the field, it
     unfolds upward from the seam on the floating panel's clock — 120ms on
     the menus' curve — its rows coming with it, since a stagger made it read
     slower than the rest of the app; it folds back into the seam in 90ms,
     holding its last results, and the
     field keeps its open shape (`data-palette-state`) until it has gone, so
     the two never come apart on the way out. A command that changes the
     screen or the project takes the results and the field's open shape away
     at once instead: folding back while the next screen draws read as a
     stray animation of its own. Nothing moves out of place, so
     the results never cover the query as they arrive. The floating panel and
     Console's rise with the same 120ms and leave in the same 90ms; only the
     movement differs, since a rise would cover the field it grew out of. The system's reduced motion turns the unfolding
     into an 80ms fade with no movement; the app's own preference drops the
     motion entirely. The panel clips its own scrollbar, whose track would otherwise cross
     the top and bottom corners, and its list shrinks with it in a short window
     rather than spilling past them. It is a popover,
     not a dialog: no backdrop dims the app, an outside press or a focus
     anywhere else puts it away, and the window behind stays usable. A screen
     with no field to hang from — its chunk is still loading — opens the same
     panel at the foot of the window, centred, rather than leaving the shortcut
     dead, and Escape closes it from the document while nothing owns the
     keyboard. The panel keeps its centre 12px inside the window's edges, so a
     field near one — as can happen in a narrow window — cannot push the
     results off screen. Choosing a destination lets the focus go with the
     screen: the field gives it up and the screen's own target takes it —
     Home's launcher, Console's prompt, the Work tab, or the Overview and Branches
     headings — so the keyboard lands where the new screen starts rather than
     in the chrome that asked. It replaced the modal that opened centred at
     `14vh`, a position it inherited from the titlebar button it used to hang
     from and which left the results far from the control that asked for them;
   - the cut mid-scroll is softened by a fade to the window's colour drawn
     directly above the strip, not by a rule. It is drawn from the strip rather
     than masked onto the workspace because a mask on a scroll container
     recomposites every frame, and the screens that scroll most are the
     virtualized diff lists. Its height is the workspace's own bottom inset,
     from the same variable — that equality is what makes the fade free at the
     end of a scroll, where the band then contains only padding. The effect
     appears exactly when there is more to see and disappears when there is
     not, with no scroll listener deciding that;
   - the fade eases (`x²(3−2x)`) rather than ramping linearly. Equal steps of
     alpha are not equal steps of what the eye sees: near black it resolves far
     smaller luminance differences, so a linear ramp shows its own startpoint as
     an edge in dark mode while passing unnoticed in light. Easing moves alpha
     4% across the first eighth instead of 12.5%, so both ends dissolve into
     their surroundings. Any future scrim in this app wants the same curve;
   - fixed workbench screens whose panels own their scrolling, such as Changes
     and History, do not use the global fade. Their panel edge is already the
     scroll boundary; fading it makes the surface appear not to end. They keep
     the same 16px above the status bar that separates their panes, and so does
     Overview once it fits the window;
   - the strip carries no version and no update state. A version is a fact
     about the app, not about the project the reader is working on, so the
     update belongs where its news belongs: the notification centre announces
     one once and is where it stays until it is resolved, Settings › Updates
     is where it is handled, the More actions menu leads there, and the field
     reaches it as a command. Nothing about the app's own state earns a shape here: green
     belongs to the remote, and the app being fine is not a fact to restate.
     The strip also carries no "all is well" dot, for the same reason. What's
     new has no surface of its own: it is a group of Settings › Updates (see
     the application-update entry below), and every "What's new" in the app —
     the macOS Help menu, the command palette, About and the startup toast —
     opens that section at that group. It lists each release with its version,
     publication date when known, notes, and a marker for the build being run.
     An offered release leads, marked "New version"; otherwise the build being
     run leads, marked "Your version", with its notes already open. Every
     earlier version follows under "Earlier versions" as a one-line
     keyboard-accessible disclosure — bare chevron, version, how many notes it
     carries, date — whose notes stay collapsed until requested, so a long
     history still scans.
     Each release's lines come from its own `docs/release/highlights/v<version>.json`
     — bilingual, one glyph per line, scaffolded by `release:prepare`, validated
     by `check:docs` and required by the merge coordinator — and the changelog
     is assembled from that directory at build time, so a version is added by
     writing one file and old versions stay listed for good. The date is the
     day the version was published — its release tag's date, resolved when
     the app is built; a checkout whose tags are missing falls back to the
     day the release branch was cut. A version with nothing to tell a user (a
     pipeline-only preview) is left out rather than shown empty; only the
     build being run is always listed, and says so when it has no lines. A
     checkout between releases, with no file yet, is listed undated.
     Notes are bundled and open without a network request; opening the
     section or a release never checks. An offered release whose feed carries
     no highlights shows its remote notes as bounded plain text, which cannot
     load markup, links or images. The
     titlebar stays reserved for global actions and window controls; no product
     name is repeated because the window is already the product;
   - the current branch is the strip's one navigation shortcut. Its
     quiet text treatment gains a hover/expanded fill and opens a compact,
     searchable selector above the strip. It shares search and project-scoped
     favourites with Overview's roomier selector: favourites sort first and
     may be isolated without changing repository or session order. The status
     version keeps fewer rows visible, while the Overview version uses its
     content surface to show more rows. Both show the latest saved-version
     subject under the branch name so the same target has the same information
     hierarchy wherever it opens. Choosing a target still enters the normal
     previewed, state-checked switch flow. The full inventory and management
     actions stay in Branches. Detached and not-yet-saved states remain static
     facts;
   - the cloud refresh belongs only to the adjacent project-sync fact. It checks
     remote information without refreshing files, history, or branch inventory.
     Local repository facts normally follow watcher invalidation, so screens do
     not repeat permanent checkers just to appear fresh. A screen exposes a
     manual action only where its ownership is useful: Changes when watching is
     off, unavailable, or a read failed; History inside the equivalent watcher
     notice or beside a failed snapshot; Branches
     beside a retained stale snapshot; and Overview beside the specific failed
     local, remote, or history fact. Overview never coordinates an omnibus
     refresh across unrelated local and network reads;
   - watcher notices precede the screen title, use the same visible “Update
     now” action in Changes, History, and Branches, and link directly to General settings
     to restore automatic updates. Their accessible names may retain the exact
     data scope while their visible recovery wording stays consistent. Both
     actions use the same quiet control treatment; a manual update keeps the
     notice mounted, changes its label to “Updating…”, and spins its refresh
     icon until the owning read settles;
   - automatic-update copy stays literal and compact: Settings explains that
     file and saved-version changes update open projects, while the warning
     says only that updates are off/unavailable and the current screen may be
     out of date. The adjacent actions carry the recovery instructions;
   - remote checks remain independent from screen visibility. General settings
     offers manual-only, 15-minute, 30-minute, and hourly cadences; one timer
     follows the active project session, skips states without a usable upstream,
     and shares the same deduplicated check path as the status-bar action;
   - the Git row in Settings says which Git GitOdile runs: how it was
     installed (Git for Windows for all users or just you, GitHub Desktop's
     copy, Homebrew, Apple's developer tools…) and the executable's path, as
     two plain secondary lines with no glyph in front, since the tile already
     says Git. A path's copy and show-in-the-file-manager follow Overview's
     project path: borderless, surfacing on hover or focus, always visible on
     touch, named after the platform's file manager (Explorer, Finder, or a
     plain folder). "Technical details" is a separate card under the row,
     closed by default and read only when opened;
   - the application's update has one home, Settings › Updates
     ([ADR 0044](docs/adr/0044-give-application-updates-one-home.md)). Every
     way in — the update entry of More actions and of the macOS menu, the
     command palette, the notification, About and the startup toast — opens
     that section, including when no project is open, and none opens a modal.
     An entry that says "check" checks only from a settled state with nothing
     offered (not checked yet, up to date, cancelled, failed, unavailable): a
     fresh check replaces the candidate, so from "Ready to install" it would
     throw away the download the reader came to install. One feature-owned
     controller backs the section. Updates is its own settings section — it
     has state and actions of its own, like Git — so it never shares General
     with the project-refresh group. Neither of its groups is named after the
     tab. The first group is the app itself: its installation row, then the
     startup-check switch as a second row, with no group title for one
     switch; What's new follows as the reading part of the section. The app's
     row is the shared installation row: the installed version is a monospace
     chip beside the name, next to the state chip, which names the offered
     version itself ("0.6.0 available") rather than leaving it to a second
     line. Once current, the row's fact under the name says when — "Checked
     5 min ago", in the status bar's wording for a check. A toned status line
     (icon and ink, no capsule) appears only when it says more than the chip —
     a block, an unavailable check or a failure, as the cause when there is
     one. The row carries the whole lifecycle in place, with one contextual
     primary in one spot: "Check for updates" (or "Check again" once
     current), "Download (size)", "Install and restart" with the
     close/restart consequence beside it as the row's hint, and "Try again"
     for a retryable block or failure. Work in flight — checking,
     downloading, verifying, installing — has no primary: the chip's spinner
     and the progress say what is happening, and a grey button repeating the
     chip's word offers nothing to press. A block a retry cannot clear, and a
     development build that has nothing to check, have no primary either;
     their line says why. Cancel stands beside the
     primary while a named check or a download runs. The manual download is
     always in the row, as the quiet external-link button the Git and gh rows
     use for their guide ("Download manually from GitHub"); where the cause's
     sentence recommends it — never offline, after a timeout or for an edit the
     reader can finish — it becomes the labelled "Manual download" secondary
     instead, so it is never offered twice. The
     progress sits under the name: determinate and indeterminate progress use
     the same stable region, outside the announced status, and reduced motion
     replaces the moving indeterminate bar with a static fill. Checking never
     downloads; downloading never installs; nothing installs without that
     button. There is no channel choice: every installation follows the one
     release feed (ADR 0019). The one switch, on by default, is for the
     startup check — one bounded
     request when the app opens, repeated once a day only while it stays
     open, a day on the wall clock so time asleep counts; a check that
     failed and can be retried tries again an hour later. Its label is
     "Check for updates automatically", and its description says when and
     that nothing from the projects is sent, without repeating the label's
     verb or naming GitHub, which reads as the user's account there; the
     release host is named by the row's manual-download link. It discloses
     that repeat and the
     transmitted-data boundary beside it. While a release can be downloaded,
     installed or retried, the More actions trigger carries the bell's
     accent dot, its accessible name adds which version waits, the Settings
     rail marks Updates, and the update entry names the next step with the
     solid arrow — "Update to X.Y.Z…", "Downloading X.Y.Z…", "Install
     X.Y.Z…" — and is "Check for updates" otherwise. A background check that
     finds a release records an app-wide notification (info tone, collapsing
     on the version, opening Settings › Updates); one that finds nothing or
     fails records nothing, because "still up to date" is not an event. A
     download that finishes while Settings is closed moves that same entry
     on to "X.Y.Z finished downloading" — an event, so it stays true after
     the install — and marks it unread again, even when
     the find was read; one watched in Settings records nothing. No
     background check runs over a finished download: a check replaces the
     offer, and would throw the download away. The
     first launch after an install reports how it went without asking for
     anything when it worked: a toast says "Updated to X.Y.Z" and, when that
     version has highlights, offers "See what's new". Only a restart on the
     wrong version interrupts: a dialog under its own title states the
     installed version, says so in one sentence, and offers the manual
     download and "Check again", which closes onto Settings › Updates and
     checks there. The update copy never names the product and keeps each
     state to one short line;
   - interactive chrome keeps the text at 13px and inline icons at 14px; a
     block segment stands 30px tall and the field 32px, on a 44px strip. Coarse
     pointers receive the standard 44px target and a correspondingly taller
     strip;
   - it must never state something untrue about a repository. It is the one
     surface in the app whose whole purpose is to be believed at a glance.

4. **Primary workspace**
   - task-focused content;
   - clear empty states;
   - contextual primary action;
   - secondary technical details on demand.

   **Settled direction for a project's home: the Journey page.** It is what
   Overview is built as, and the pattern any other screen that summarises
   state for a person should reach for before inventing its own. It was
   chosen after mocking up three directions against the same data and then
   fusing two of them:

   - *Dashboard* (Vercel's project overview, Supabase's home, Stripe's
     "Today"): a page header, a row of equal stat tiles where each tile is
     also the action, then two equal columns of what changes. Best density
     and the least empty space, but a row of numbers says "how is it" and
     never "what now".
   - *Property rail* (Linear's or Asana's project page): a main column beside
     a narrow list of properties. Dense and calm, but it is the shape of a
     tool for people who already know what the properties mean — the
     "manager" look the brand steers away from.
   - *Next step* (Headspace's or Fitness's home, Duolingo's path): one
     question — what do I do now — answered by a stepper with the current
     step lit and one action. The most GitOdile of the three, since change →
     save → publish is the model the product exists to teach; alone, it
     under-serves the reader who already knows Git and wants the numbers.

   The Journey page is the third with the first's density: one card that
   answers "what now", over the lists that answer "where is my work". It was
   reworked in 0.3.1 from a band of three equal tiles, after a design review
   found the band weighed two done steps as much as the waiting one and said
   "publish" four times on one screen. Its parts, top to bottom:

   - **One row, not a header block** (Vercel's and Linear's page tops): the
     project's own icon, its name, the project's folder and its settings as
     bare round glyphs right after the name — actions on the project beside
     the name they act on, in the secondary ink and a full gap from it so
     they never read as part of the title — and, at the row's end, where it
     lives as a chip, lined up with the next-step card's buttons below: the
     edge of the row is what leads out of the app. No slash before the chip:
     before an `owner/name` it read as one long path.
     The icon is the identity chip the rail shows for the project and opens
     its icon picker. The chip is hairline-edged and unfilled at rest. Where
     it lives is the remote the branch publishes
     to (else `origin`, else the first): the service's mark (GitHub, GitLab,
     Bitbucket, a cloud for any other server) and the remote's `owner/name`
     in mono, in the secondary ink, opening the page in the browser when one
     can be derived — the hover surface, the primary ink and a small arrow
     say so. Rust derives that page from the project's own configuration and
     opens it; the renderer names the remote, never an address. With no
     remote it reads "Only on this computer" beside a laptop. Until it is
     read its shape holds the place, so it never claims a remote is missing.
     The branch it is on is not here: the status bar names it and switches it,
     and two switches for one branch on one screen was a duplicate. The
     technology and the path are properties, not part of the
     address: a row that mixed a 17px name, a 30px pill and 12px text read as
     a mismatch rather than a hierarchy, so both left the row: the path is the
     folder button's tooltip and the technology is the project's own icon.
   - **The next-step card**: the one thing to do now, a sentence saying why,
     and the button that does it — the page's one primary button. Its title
     leads: no caption above it and no bar of steps beside it (the three
     steps of the model were drawn as a three-segment bar until 0.3.1; on a
     calmer, more professional page they read as a tutorial's chrome). The
     glyph keeps its circle: square shapes belong to a project's identity
     (its icon, the project popup), not to a state. The state's colour
     is one of the status tokens every theme defines — `--status-warning` for
     unsaved work (the colour the project popup already gives it), the
     accent for saved versions waiting to be published, `--status-renamed`
     for newer versions on the remote, `--status-danger` for overlaps or a
     failed check — and it is a signal, not a surface: it inks the glyph on
     its circle, washes the band faintly, and nothing else. The glyph is the
     band's one strong point of colour, where the eye lands first; with
     nothing waiting it is the neutral circle again. A wash, a tinted edge, a tinted tile and a tinted kicker spent
     the same amber four times and made the primary button compete with the
     card around it. No edge stripe. With nothing waiting the card is plain and offers nothing to
     press. The primary button keeps the theme's accent in every state except
     overlaps, where the action is "stop and decide" and takes the danger
     colour. The card's glyph circle breathes once as a step becomes current.
     **The card is always one colour.** What comes after the current step —
     versions waiting on the remote, or saved versions still to publish — is
     said in one quiet line under the sentence, an arrow and the secondary
     ink ("→ Then: 3 new versions on origin"), never in a second hue: unsaved
     work with news on the remote is an amber card with a grey line, not
     amber and blue. A check that failed
     keeps the card calm and puts the failure in its glyph alone: the work is
     safe, only the remote could not be asked.
   - **A living timeline beside a side column.** Versions the last remote
     check found waiting lead the timeline, above *now* — which is where they
     stand in time — as one row with a dashed blue node ("origin · 3 new
     versions · Get"). Then *now*, one line: "Now · 4 unsaved changes" with a
     dashed ring in the unsaved colour, the kinds of change as small glyph
     counts, the whole line a way into Changes; it names no files, the side
     column does, and with nothing unsaved it is one quiet line. Under it, the
     versions still only on this computer are grouped under a chip on the
     rail, "On this computer", its Publish glyph in the local green (a laptop
     in the unsaved colour when there is no remote at all); then the same
     chip, "Published", its cloud in the remote's blue, marks where the
     remote's copy of the branch begins, then the published versions. The
     chips' glyphs sit over the rail where the nodes are; they carry no count
     (the rows say how many) and no rule running to the edge, and the
     remote and its branch are the "Published" chip's tooltip.
     One rail runs the whole list. "Publish up to here" still appears on an
     unpublished node under the pointer or focus, as the status bar's sync
     pill in a circle: the control surface and a hairline, only the cloud in
     the accent, fading in without growing, while the half-filled node beneath
     stays as it is.
   - **The node's shape says where a version stands, so no row is filled.**
     Unsaved work is a dashed ring, a version saved but not published is half
     filled, a published one is a solid disc in the node fill — the same fill
     the half circle uses, so one family reads "saved" and only the shape says
     where — and versions waiting on the remote are dashed blue: the same
     reading Linear gives its status glyphs, and it survives greyscale. The fill is
      `--node-fill`: 65% of the primary ink over the panel, the same recipe in
      light and dark, so a column of saved nodes sits a step below the one
      accent node without losing the solid state. An empty node's ring is
      `--node-ring`, half the secondary ink, on every screen that draws one.
     History's timeline draws its nodes the
     same way (an unknown publication stays an empty ring), and both ring the
     node in the accent with a soft halo under the pointer rather than filling
     it, so the selected version on History stays the one green node. Selection
     changes the node's colour, never its shape: a selected local version stays
     half filled with the filled half in the accent, a published one becomes a
     solid accent dot, so selecting a row never makes it look published. The
     timeline therefore has no tinted rows or groups; the next-step card is
     the only surface on the page that wears a state's colour, and its button
     the only solid accent. The
     "current" badge is a neutral capsule (on History too), and the
     timeline's and side column's links ("Review", "View all", "Connect")
     are in the primary ink with their chevron, not the accent.
     Beside it, a **side column that follows the card**: one detail of what
     the next step will move — "What you'll save" (files and the line totals
     as a bar whose green eases into red around the added share, never a hard
     edge; with only one side it is one colour), "What you'll decide" (the files with
     overlapping parts), "What you'll get" (the incoming versions by title and
     author), or "What you'll publish" (the files the unpublished versions
     carry, "9+ files" while not all are read). No card says anything more
     under its list: the next-step card above already says what the step
     does and where the work goes. The totals are in the secondary
     ink and the bar, a thin 2px line at reduced strength, is the one place the
     diff's colours show, so the card does not open on a red number. The card's
     head glyph is in the secondary ink whatever the step, overlaps included:
     the step's colour belongs to the next-step card alone.
     The two cards side by side both lead their title with a glyph: the
     step's own here, a history clock on "Recent history", which keeps it in
     its loading shapes too so nothing shifts when it lands.
     Their heads match: the same title size (`--text-subtitle`), a 16px
     glyph and the same link at the end ("View all", "Review"), so they read
     as sibling cards and the hierarchy is the content's.
     There is no drawing of this computer and the remote beside it: the
     next-step card, the timeline and the status bar already say how they
     stand, so the column holds only what the next step moves. Every part of
     the screen loads the same way — its own shape in placeholder text, never a
     spinner or a guessed state: the next-step card until both the files and
     the remote's last known state are read (so "not checked" never flashes on
     opening), the "Now" row, the timeline, and a detail card's
     list until its files or versions are read. The whole screen's placeholder
     during launch restore is built from the same pieces. A discard
     that can still be restored is offered whatever the step, unsaved work
     included: a copy only counts as restorable while nothing has been
     written at its paths, so it never lands on that work. It is always the
     same card, headed like its siblings ("Discarded changes", "Restore ›")
     and one step smaller (a 13px title, a 14px glyph, tighter rows), with no
     figure: each copy is a row with a clock, when it was discarded and what
     it holds ("3 files · App.tsx, README.md"). Alone in the column it takes
     the column's height. Under a detail card the two share it and the
     detail card leads: it takes the height its rows need and what is left
     over, while the copies take room up to about nine rows. When the
     detail card's list is long, the copies give way first, down to about
     four rows, and only then does the detail card's list scroll. With
     neither a detail nor a discard there is no column, and the timeline
     takes the screen's width. "When" is said as the timeline says it ("yesterday", "3 days ago"). It is a safety net
     rather than a step, so it wears no state's colour: no wash, the icon in
     the secondary ink. Files are never added up across copies, which can
     share them. "Restore" opens the restore picker over the Overview on
     the newest copy, a row on that copy: closing it stays there, and only a
     restore moves on to Changes, which shows what came back. The column's
     rows carry no tooltip, as the timeline's do not: each already shows its
     name and folder, and pressing it leads to the rest. The column
     repeats nothing the status bar or the timeline already says: the remote
     check, the project's path and its technology are not here (the path is
     the folder button's tooltip; the technology is the project's own icon).

     **Fitted to the window.** Tall and wide enough (620px by 981px), Overview
     has no scroll of its own: the header and the card keep their height and
     the body takes the rest. Every detail card scrolls its list (up to 50
     rows, the rest counted at the end), the discarded copies too, fading at
     the bottom while there is more below; scrolled to the end, its link
     ("Review", "Resolve", "History", "Restore") takes the lead and breathes
     once, as "View all" does at the
     end of the timeline. The
     timeline scrolls inside the page too: "Now" stays pinned at its
     top, and the versions of the history's first page scroll under it, its
     bottom edge fading while there is more below. The group's label and the
     remote's mark stick to the top while their versions pass, so what is in
     view always says whether it is published. Whole rows would leave up to a
     row and a mark of empty card; a scroll fills the card at any height.
     The line ends in words, never a second "View all" (the header has it):
     the latest versions shown and that older ones are in History, where the
     project began, or that a shallow copy's older versions were never
     downloaded. Scrolled to the end of a branch that goes on, the header's
     "View all" takes the hover surface and breathes once (it quiets when
     scrolled back up). The scroll uses the app's auto-hiding scrollbar.
     Scrolling and resizing read nothing from Git. Smaller than
     that, the screen scrolls as a page with lists of a fixed length (five
     rows; two discarded copies under a detail card).

   Three rules hold it together: one primary button per page (the card's, or
   none when nothing is waiting), one vocabulary of glyph tiles (filled
   circles, never rings), and nothing counted twice (the card says the number
   the step is about; the timeline groups the versions instead of counting
   them again; the remote check lives in one place). A screen that adopts the
   pattern keeps the card over its own lists; it does not add a band of tiles
   back on top.

5. **Optional inspector**
   - metadata;
   - exact Git details;
   - file or commit information.

The app should work well between approximately 1024px and large desktop displays. Do not assume a maximized window.

## Design tokens

```css
:root {
  /* Radius states a role, not a size — see Shape below. */
  --radius-item: 10px;
  --radius-control: 14px;
  --radius-surface: 18px;
  --radius-identity: 28%;
  --radius-field: 16px;
  --radius-pill: 999px;
  --radius-round: 50%;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  /* Icon size states a role — see Icons below. */
  --icon-badge: 10px;
  --icon-meta: 12px;
  --icon-row: 14px;
  --icon-control: 16px;
  --icon-nav: 18px;
  --icon-tile: 20px;

  /* Control size states a role, not a measurement — see Size below. */
  --control-height-xs: 24px;
  --control-height-compact: 28px;
  --control-height-sm: 32px;
  --control-height-md: 38px;
  --control-height-lg: 44px;
  --control-font-sm: 12px;
  --control-font-md: 13px;
  --icon-button-chip: 20px;
  --icon-button-inline: 24px;
  --icon-button-attached: 28px;
  --icon-button-chrome: 36px;

  /* Type size and weight each state a role too — see Typography below. */
  --text-hero: 28px;
  --text-display: 22px;
  --text-title: 17px;
  --text-subtitle: 15px;
  --text-lead: 14px;
  --text-body: 13px;
  --text-label: 12px;
  --text-caption: 11px;
  --text-micro: 10px;

  --weight-normal: 400;
  --weight-medium: 500;
  --weight-strong: 600;
  --weight-heading: 650;
  --weight-title: 700;

  /* Leading and tracking state a role too — see Typography below. */
  --leading-none: 1;
  --leading-tight: 1.2;
  --leading-snug: 1.35;
  --leading-normal: 1.5;
  --leading-code: 1.6;

  --tracking-hero: -0.02em;
  --tracking-tight: -0.01em;
  --tracking-wide: 0.02em;
  --tracking-caps: 0.06em;

  /* The two stacks, named once each. */
  --font-sans: ui-sans-serif, system-ui, ...;
  --font-mono: ui-monospace, SFMono-Regular, ...;

  --duration-fast: 120ms;
  --duration-normal: 180ms;
  --duration-exit: 90ms;
  --ease-emphasized: cubic-bezier(0.16, 1, 0.3, 1);

  /* A tint's strength states a role — see Tints below. */
  --tint-hover: 5%;
  --tint-selected: 8%;
  --tint-fill: 12%;
  --tint-fill-hover: 16%;
  --tint-halo: 24%;
  --tint-halo-focus: 32%;
  --tint-edge: 40%;
  --opacity-disabled: 0.5;
  --opacity-muted: 0.55;

  /* What floats over the window, in stacking order — see Elevation below. */
  --layer-drop: 9;
  --layer-dialog: 10;
  --layer-palette: 20;
  --layer-popover: 30;
  --layer-nested-popover: 60;
  --layer-tooltip: 1000;
}
```

Colors should be defined semantically rather than by component:

- `--surface-app`
- `--surface-panel`
- `--surface-raised`
- `--surface-code`
- `--text-primary-color`
- `--text-secondary-color`
- `--border-subtle`
- `--accent-primary`
- `--accent-primary-contrast` (text/icon color placed on top of `--accent-primary`)
- `--accent-primary-fill` (theme's solid fill for primary actions and selected controls)
- `--status-success`
- `--status-warning`
- `--status-danger`
- `--status-danger-contrast` (icon/text placed on a danger fill)
- `--tone-local` (what is saved here and not published — its own token so
  "only on this computer" never reads as success or an added line)
- `--accent-heart` (the About footer heart — its own token so a red heart is
  never mistaken for a danger state)
- `--diff-added`
- `--diff-removed`
- `--overlay` (modal/backdrop scrim)
- `--surface-hover` / `--surface-active` (neutral interactive-state tints, used for any hover/pressed/selected state instead of one-off `rgba(...)` values)
- `--surface-control` / `--border-control` (the fill and edge of a control that sits *on* a raised card — see Shape below; never use `--surface-panel` for this, it is the same white as `--surface-raised` in light mode and leaves the control with no step of its own)
- `--surface-card` (the fill of a card sitting *inside* a panel — a section of the History overview, a fact card on the Branches detail. A mix of `--surface-raised` into `--surface-panel`, so it resolves per theme from one definition)
- `--focus-ring` (the visible keyboard focus color, distinct enough against every focusable surface)
- `--shadow-sm` / `--shadow-md` / `--shadow-lg` (elevation; theme-aware, see below), and `--shadow-up`, `--shadow-lg`'s colour cast upward for a surface that sits on another's top edge

Do not hard-code product colors throughout components.

**Spacing sits on a 4px grid.** Padding, margin and gap take a `--space-*`
step, or a multiple of 4px above the scale (a dialog's 28px inset). A value
between two steps rounds up onto the grid — the 6, 10 and 14px that had
spread through the cascade became 8, 12 and 16. Only two literals sit off it:
1px, a hairline's width, and 2px, the one optical nudge (a chip's inner
padding, a glyph pulled onto the text's baseline). A length that is geometry
rather than space — where a row's text starts after the timeline's node
column — is a named custom property that says so, not a spacing literal.

### Tints

**A tint's colour comes from the theme; its strength comes from its role.** A
tint is a theme colour — the accent, a status, the ink, a tone, a diff colour —
mixed into transparent or into the surface under it:
`color-mix(in srgb, var(--status-warning) var(--tint-fill), transparent)`. The
accent alone had been mixed at fourteen strengths, so the same selected row was
7% on one screen and 12% on the next.

| Token | Strength | What it is for |
| --- | --- | --- |
| `--tint-hover` | 5% | A neutral row or field under the pointer |
| `--tint-selected` | 8% | A quiet wash: a selected row or option, a toned band |
| `--tint-fill` | 12% | A notice or banner, a badge, a diff line, a tinted control at rest; a selected row under the pointer |
| `--tint-fill-hover` | 16% | That fill under the pointer or pressed; a glyph tile inside a notice |
| `--tint-halo` | 24% | A ring round a node: included, selected or hovered |
| `--tint-halo-focus` | 32% | The same ring while it holds keyboard focus |
| `--tint-edge` | 40% | The border of a tinted notice, badge or chip |

What is not a tint of the interface keeps its own number and
`styleComposition.test.ts` names it: the theme picker's miniature diff, the
two search highlights, the loading bar's track, the branch route's lit hit and
the timeline rails.

**Opacity has two meanings.** `--opacity-disabled` (0.5) is a control that is
unavailable, on every screen — seven values from 0.35 to 0.6 had said it before.
`--opacity-muted` (0.55) is something present but set back: an excluded file,
a diff's line numbers, a calendar day outside the month, a favourite star at
rest. Decoration — the Console's watermark, the mascot, a drag ghost — keeps
its own.

### Elevation

Use shadows to signal stacking order, not to decorate: `--shadow-md` for the screen's one sheet (and Home's floating launcher), the one object on the plane; `--shadow-sm` for controls and a small object lifted inside a region (an empty state's glyph tile); `--shadow-lg` for anything floating above the whole UI (dialogs, popovers). Regions of the sheet cast none ([ADR 0032](docs/adr/0032-one-sheet-per-screen.md)). In dark mode shadows read as depth against the near-black background; in light mode they carry more of the separation work since borders alone are subtler there — both are defined per theme so neither look goes flat.

**What floats stacks on a scale, not on a number.** Anything that sits over the
window takes a `--layer-*`: the folder-drop veil, then the modal backdrop and
its dialog, the command palette, menus, popovers and toasts (above a dialog,
since they open from one), a picker opened from inside a popover, and the
tooltip over everything. A single digit is only for ordering inside one
component's own box — a lane under its node — and never on a fixed surface.
A ring or underline drawn with `box-shadow` (`0 0 0 2px`) is an edge, not
depth; anything with a blur is an elevation token.

### Shape

**Radius states a role, never a size.** There is no house radius applied to
everything, and there is no "small/medium/large" scale to pick from — sizing
the radius by eye is exactly what left buttons scattered across three different
values before this was written down. Choose the tier by what the thing *is*:

| Token | What it is | Examples |
| --- | --- | --- |
| `--radius-round` (50%) | An atomic thing with no reading direction | Person avatar, **any single glyph on a fill** (section, status and dialog-header icons), rail destination, refresh, create, overflow trigger, checkbox, timeline node |
| `--radius-identity` (28%) | A project's identity chip — proportional, so it is the same rounded square from 20px to 56px | The status bar's project segment and its popup, Home's recents, project-icon previews |
| `--radius-pill` (999px) | **Any single-line control**, a capsule of short text, or a pure geometric form | Labelled button, single-line input, search box, selector or trigger; badge, count, status chip, progress bar, scrollbar thumb, toggle track |
| `--radius-field` (16px, half the field's height) | The app search's field, which opens into the palette — a capsule at rest, but a real length so it can morph into the results' foot (999px cannot) | The status bar's search (16px; 22px on a coarse pointer), Home's search (14px), the top corners of the palette grown out of either |
| `--radius-item` (10px) | A row or option that lives inside a container | Menu row, list option, file row, segmented-control option, inline code, keycap, square icon button of 24–36px that is not in an action row |
| `--radius-control` (14px) | A control that *cannot* be a capsule | Multi-line field (textarea), a frame wrapping its own options (segmented control), a preview box (a theme-picker card), square icon button of 40px and up that is not in an action row |
| `--radius-surface` (18px) | A container carrying its own background | Card, dialog, popover, menu, notice, banner, panel |

A circle has no "length", so it has no radius to scale — that is why it is a
role and not a number. Mixing circles with the rectangular tiers in one row is
correct and intended: it is what lets a labelled control read as primary next
to its icon-only satellites without spending an accent color on the difference,
since a circle of the same box reads optically smaller and lighter. Three radii
in one row is where it stops being a system and starts being drift; keep it to
two.

A single-line control is **fully rounded**: a capsule when it carries a label,
a circle when its box is square. The two are the same shape at different aspect
ratios, so a button, a search field and an icon button read as one family, and
hierarchy comes from fill and colour rather than from corner size. Two things
follow. A capsule needs inline padding near its radius — about 0.4 of its own
height — or the label sits inside the curve. And capsules nest concentrically
with each other for free: radius is half the height, so `outer = inner +
padding` holds at every size without anyone computing it. The Changes action
cluster is the worked example — a capsule wrapping two circles and a capsule.

What stays rectangular is what *cannot* be a capsule: a textarea, because it is
multi-line and a capsule would deform it; a frame that wraps its own options,
like the segmented control, whose options are rows and would have to become
capsules with it; and a preview box, which holds a layout rather than a line of
text.

The three rectangular tiers are a **concentric chain**, so a container is
already the right radius for what it wraps:

```
item 10    + 4 padding = control 14    a segmented control around its options
item 10    + 8 padding = surface 18    a menu around its rows
control 14 + 4 padding = surface 18    a toolbar around its buttons
```

Six constraints keep this honest:

- **Concentricity** (`outer = inner + padding`) is measured against whichever
  child sits at the container's *corners*, not against its tallest or its
  first. The Changes action cluster hugs 38px circles (r=19) with 8px of
  padding, so it is `--radius-pill`, which resolves to 27 at that height and
  stays correct when a coarse pointer grows the controls to 44px. Get it wrong
  and the corners look pinched. It only binds when a child is actually near a
  corner: the Overview summary card stays `--radius-surface` because its
  controls sit 24px inside it.
- **A circle needs a square box.** Only apply `--radius-round` where width and
  height are both pinned. If a narrow layout lets the control stretch, the
  circle becomes an ellipse — give the free width to the labelled action and
  leave the icon buttons at `flex: 0 0 auto`.
- **A container stops being a card at half its own height.** `--radius-surface`
  on a 54px cluster still reads as a rectangle; on a 36px one it is a pill, and
  the contrast against the circles inside it is gone. Reach for
  `--radius-pill` deliberately in that case rather than arriving there by
  accident.
- **A glyph tile is a circle at every size.** A square holding one icon on a
  fill — a section heading, a status marker, a dialog header, a row's leading
  icon — is the same atomic thing as an avatar, so it takes `--radius-round`
  whether it is 24px or 52px. It is not sized into a tier, because it has no
  length to scale. The two exclusions are worth knowing: a tile with a
  transparent fill is not a tile (it is a bare glyph, and rounding nothing is
  nothing), and a preview holding a miniature layout rather than one glyph is a
  container, so it stays `--radius-control`.
- **A square icon button is a circle when it lives in an action row.** Ask
  where it sits, not what it does. An *action row* is a strip whose whole
  content is standalone actions — the rail, the titlebar cluster, a panel
  header's action group; there, an icon-only button takes `--radius-round` and
  joins the family. Anywhere else the button is an **affordance attached to a
  host** — a notice's dismiss, a path's copy button, a dialog header's close, a
  settings row's reorder arrows — and it stays rectangular, because rounding it
  would make it compete with the thing it belongs to. The one exclusion is
  `.window-control`: minimise/maximise/close are the operating system's chrome
  and follow its conventions, not ours, even though they sit in an action row.
- **A rectangular icon button takes the tier below its side.** This is the one
  place size still enters the decision, because one value cannot serve a 24px
  box and a 52px one. Up to 22px use `--radius-round`: at that size any radius
  worth seeing has already closed the shape into a circle, so name it one. From
  24 to 36px use `--radius-item`, from 40px `--radius-control`. Both bands land
  the shape between 0.27 and 0.42 of radius over side, which is what reads as
  clearly rounded and clearly not a circle — `--radius-control` on a 28px
  button is exactly 0.5, an accidental circle. A guard in
  `styleComposition.test.ts` fails the build on anything that lands in the
  0.43–0.5 gap between the two readings.

One caveat that applies to every circle above: `border-radius` clips pointer
hit-testing, so a circle loses about a fifth of its clickable area and its
corners go dead. That is a real cost only where the shape is a *target* — keep
the 44px coarse-pointer override on circular controls, and prefer a rectangle
for a small interactive one. It costs nothing on an avatar or a glyph tile,
which is why those are circles at any size.

### Size

**A control's height is a token, the same way its radius is.** There is one
house size and it is `--control-height-md` (38px). A feature does not get to
pick a height; if a control needs one, it takes a tier.

| Token | What it is | Examples |
| --- | --- | --- |
| `--control-height-xs` (24px) | A chip or capsule inside a row | Filter chips and capsules, timeline chips, the Console status line's buttons |
| `--control-height-compact` (28px) | A field, tab or picker inside a strip | The status-strip searches of Home and the Console, Home's tabs, the History scope picker, the Console's shortcut form |
| `--control-height-sm` (32px) | An action inside a row it must not out-weigh | Row actions, ghost buttons, the quick-switch create circle |
| `--control-height-md` (38px) | **Any labelled action, and its square siblings** | Every primary/secondary button, single-line inputs, refresh and overflow circles |
| `--control-height-lg` (44px) | Reached only through `pointer: coarse` | Nothing declares it directly |

**A square icon button's size says where it sits**, the same way its radius
does (§ Shape). Nine sizes from 20 to 36px had grown, so a toast's close and a
notification's were two different buttons:

| Token | Where it sits | Examples |
| --- | --- | --- |
| `--icon-button-chip` (20px) | Inside a chip | A filter chip's remove |
| `--icon-button-inline` (24px) | Inside a field or capsule | Clear a search, the filter trigger, a calendar's month step |
| `--icon-button-attached` (28px) | Attached to a notice, toast, card or pane strip | Dismiss, close, the diff's change arrows, a notification's read and remove |
| `--control-height-sm` (32px) | An action in a row | Favourite, more, forget |
| `--icon-button-chrome` (36px) | The window's frame | Titlebar and rail buttons, a dialog's close |

A control that is not square takes its fixed height from the first table:
nine heights from 24 to 38px had grown in chips, fields, tabs and pickers, so
the status bar's branch selector stood 2px shorter than the search beside it.
Below 24px a chip is sized by its text (the compact timeline chip), and the
switch keeps its own geometry.

The sibling of a labelled action stays `--control-height-md`, the touch tier
inside `pointer: coarse` is an accommodation rather than a size, and the
window controls follow the system.

Three things this settles:

- **`lg` is a pointer accommodation, not a hierarchy step.** A dialog's confirm
  is not a bigger control than the same action on a screen. Writing 44px as a
  fixed `min-height` — which four dialogs used to do — silently ships the touch
  size to every mouse user, and it is the single biggest source of the drift
  this section exists to stop.
- **Height and type size are chosen together, in the primitive.** The button
  used to declare padding and radius and nothing else, so its height came from
  `line-height: normal` over the browser's default 16px — a number nobody chose,
  and one that differs per platform's system font. `--control-font-md` (13px)
  goes with `md`, `--control-font-sm` (12px) with `sm` — the same two numbers as
  `--text-body` and `--text-label`, because a label and the control it names
  must agree. A height without a font is half a decision and the other half
  drifts.
- **Radius depends on this.** `--radius-pill` reads as half the height, which is
  what makes the concentric nesting above true for free. It is only true where
  the height is actually known, so an un-sized control quietly breaks the shape
  rules as well as the size ones.

**A measure that decides whether two screens line up belongs to the scale, not
to a screen.** Changes and History pair the same two panels — a list beside a
detail — and the same person moves between them all day. Both used to write
that geometry themselves, and had drifted: a 280px list column against 330px,
one strip height derived twice from the same `calc`, one screen giving up its
second panel 44px of window width before the other. Four values in
`tokens.css` say it once instead:

| Token | What it is |
| --- | --- |
| `--panel-column` | The list column's grid track, with `--panel-column-narrow` below 1200px |
| `--strip-height` | A panel's own strip: the row control in it plus 10px of air above and below. Each panel's header is one |
| `--strip-height-inner` | A strip *inside* a panel — the History workspace's file and diff panes — one step quieter |

Branches pairs those two panels too, and reads at the same density as the screens
either side of it. **Its rows are two lines and one height**: the name alone,
then — quieter, under it — the states worth flagging as glyphs and when the
branch last moved at the trailing end. The states were
text chips first, and at 272px `Local only · Can't be deleted yet` is most of
the row; then glyphs on the name's own line, which left a long name
(`feature/windows-installe…`) half the row. The name is what the list is
scanned for, so it has the first line to itself, and every row keeps the
second line — for the date if nothing else — so every row is the same height.
As glyphs the states cost 14px each, and a row flags only what asks something
of the reader, each glyph with one meaning: the active branch is a ring with its
centre filled, in the accent, first — filled so it stands apart in a theme
whose accent is the text's own ink; the main branch is a house, quiet (it was a
checked shield, which read as "secure"); local only is a laptop in the local
green; versions to publish are a cloud going up with their count in the same
green, and versions to get a cloud coming down with theirs in the remote's
blue — the app's own verbs, where the ↑2 ↓3 arrows asked a beginner which way
"up" was; a remote branch that was deleted is a cloud struck through, quiet,
because after a merged pull request it is what is expected. Whether a branch can
be deleted is not on the row: its block says it, and a success tick on every
branch ready to clean up read as "done", while a warning triangle on every branch
in progress called the normal state of work a problem. Up to date with its
remote draws nothing, as it always did. A glyph has to be learned, so each one explains itself: its
tooltip is a sentence (`Local only — never published, so it's only on this
computer`), the row's accessible description reads the states out in words,
and the filter panel lists the sync glyphs beside their names, which makes it
the list's legend as well as its filter. `Active` is a word only in the detail
strip: the active branch heads the list and the strip beside it names it, so a
chip on the row as well was the same word twice on one line of the screen.

**The list is cut by what can be done with a branch, then by its name.** A flat
list of forty `feature/…`, `fix/…` and `codex/…` names read as one wall, and
the prefix filter only helped a reader who already knew which prefix to ask
for. So the active branch and the main branch head the list without a heading —
the two rows looked for first — and the rest falls into two blocks: **In
progress**, open, and **Ready to clean up**, folded. A branch is ready to clean
up when it is **finished**: its work is on the main branch — the local one or
the remote's copy — and was its own, which Git shows as a version saved on
it, a merge that brought it in, or its remote branch deleted after merging.
Not merely when deleting it would lose nothing: that proof — another ref
keeps its tip — is also true of a published branch in progress (its own remote
copy keeps it), of a branch just created on the main branch, and of a branch
another one grew from, and the block once offered all three for cleaning.
How long a branch has gone untouched decides nothing; a week's pause is not a
finished branch. Without a known main branch nothing is offered. That block is its
count in the heading's capsule and, under the heading in either state, the
action it is there for: a real button — surface, border, 44px — reading
"Clean up 9 branches…" with "Finished: their work is on the main branch" under it, the
trash in the text's ink (red is the dialog's last button, where branches are
actually deleted). It replaced `Safe to delete` with "Review" in the accent on
the heading's second line, which in a monochrome theme read as a label, named
no action and sat away from the count. The heading still only folds; from the
keyboard, Delete on it opens the dialog too. The dialog, "Delete these
branches?" in the danger tone with its primary `Delete 9 branches`, lists the block's
branches as drawn, in the inner-card recipe, each with the include node (all in), its sync glyphs and where its work is
kept, an "All branches (n of m)" node above them — its half moon when only some are in — the branches Rust left out
folded under a count with each one's reason, and "Also delete the published
copies" — an `app-checkbox`, since it is an option of the action and not an
item in it; off by default, unlike the single delete, because it is many
shared branches at once. It is there whenever the plan has a published branch
and held back, saying "None of the chosen branches is published", while no
chosen branch has one, so ticking branches never makes it come and go and the
dialog keeps one size; the facts below it are fixed by the plan for the same
reason. The recovery
fact closes the preview: each branch's name and last version are kept in a
recovery point first. When none of them can go, it is a block, "Can't delete
them yet" in the warning tone, with the reasons and `Close`. A clean-up that deleted everything closes with a toast; one
that kept a branch or left a published copy stays on screen as "Clean-up
finished", listing what was not deleted and what is still published, each
with its reason, until it is closed. Inside each block branches
cluster under their first name segment, a step quieter than the block's
uppercase label; a prefix only one branch has stays loose, first, because a
heading over one row says the same thing twice, and a cluster of more than
eight starts folded, so one crowded prefix (`dependabot/…`) cannot push the
rest out of the column. Each row then makes the part
of its name that tells it apart the loud part: a loose row's prefix is quiet
(`codex/feature/` before `about-dialog-polish`), and a clustered row drops the
prefix its heading says and keeps any middle part quiet. Clusters follow their
first branch, so the sort still decides what comes first. "Safe to delete" and
"Can't be deleted yet" left the filter panel with this: the blocks already
are that filter. A search or a filter opens every heading, so what it finds
is never folded away, and clearing it puts the list back as the reader left
it; what the reader folds or opens is kept per project across launches, and a
block opened near the column's foot scrolls into view without pushing its own
heading off the top. The list is a tree for assistive technology and the keyboard — arrows walk
what is drawn, Right opens a heading or steps in, Left folds it or steps out —
and when the selected branch is folded away, Tab lands on the heading above it.

**History's timeline rows share that shape and that vocabulary.** The subject
has the first line; under it, from the start, who saved it as initials on
their own colour, tinted rather than filled so a solo project's column stays
quiet (`.author-avatar` in `shared/ui`, keyed on the email so two people
with the same initials still read apart, the full name on its tooltip). The
user's own versions wear their initials too, on the neutral tint instead of a
colour of their own — "you" is the one author never told apart by colour — with
"You (name)" on the tooltip. A hosting account's picture never appears on a
version, only where the account itself is the subject
([ADR 0038](docs/adr/0038-hosting-account-profile-pictures.md)); the detail strip wears the same avatar at its own
size. Then
come the states as glyphs, and the date at the trailing end. The author was spelled
out there before — the longest and most repetitive fact down the column — and
the states the row could not say at all. The glyphs are Branches': where you are
is the ringed dot in the accent, saved locally is the laptop, and a tag and a
merge wear their Git glyphs — the tag with its name beside it, truncated,
because which release it marks is the point of a tag; published is the unremarkable state and draws
nothing. Both lists draw them with the shared `StateGlyph` (`.state-glyph` in
`primitives.css`), so a glyph cannot look one way on Branches and another on
History, and the timeline filter's "Only unpublished" switch wears the same
laptop, as Branches' filter does, and "Only tagged versions" and "Hide branch
merges" wear theirs, so the panel doubles as the legend. Where the published
versions begin, a block heading opens them: Overview's and Branches'
"Published" chip on the rail (`TimelineChip`), its cloud in the remote's
blue. Where they are published — `origin/main` — and both sides are on its
tooltip, which also says when that branch has since been deleted; the
heading named the remote first ("ORIGIN"), which said the same less clearly.
Over the versions only on this computer, the "On this computer" chip, its
Publish glyph in the local green. Each chip is the button that folds its
block, its chevron inside it, and neither carries a count. Under the
pointer the chip's tint is mixed into the panel, never laid over it, so the
rail never shows through. They replaced uppercase captions ("LOCAL" with a count capsule,
"PUBLISHED") beside a disc on the rail. The two names say what the versions
are, a few words each: "Not published" and "Published on origin" said the same thing at
three times the width and were cut off in the column. Both headings fold their
block from its chip (Right opens, Left folds); a folded
published block offers no older versions. They are drawn only together: when
nothing is waiting to be published, a lone heading over every version would
say nothing. It used to be a dashed rule with `4 not published` at its end,
as Overview's timeline once drew it; as two block headings the column reads
in two blocks, the way Branches does, and "what haven't I published?" is still
one heading to find rather than a laptop to read off every row. On the
current branch the local head also offers to publish: "☁ Publish" beside its
count opens the publish flow, with its preview, as a pointer shortcut beside
the toolbar's Publish, the cloud (`CloudUpload`) always in the accent so it
reads as an action before the pointer finds it; under the pointer the capsule
takes the control surface and hairline that Overview's "Publish up to here"
circle and the status bar's sync action wear, and the words step up to the
primary ink.

**The rail opens into lanes only where the history branches.** On a single
branch the column is that branch's own versions — each first parent from the tip
— and a merge says how many versions it brought in, in a small capsule behind
a chevron: pressing it (or Right on the row; Left folds it again) opens them
on a lane of their own that leaves the merge and joins the branch where they
parted. "All branches" draws every branch at once; it is one glyph in the search
box, beside the filters, the way Changes keeps its list/folders toggle — a
single line with a node while one branch is read, a graph of lines (pressed, in
the accent) while all are — with "Show all branches" / "Show only this branch" on
its tooltip. It lived in the filter panel and was hard to find there; the
panel keeps only the rarer choice of another branch by name, which is the one
scope still stated as a chip under the strip. Lanes are drawn thin: 1px
strokes 11px apart, the first on the rail's own x, curves where lines part
and meet. The rail and the lanes are one drawing in both scopes: the same
10px node with a 1.5px ring (half filled while saved only here, solid in the
node fill once published) and the same 1px stroke in the trunk's ink, so
switching scope
changes what is drawn, never how — a 12px rail node beside 8px lane nodes
read as two components. The branch read is the trunk in the secondary ink and
every other branch takes a brand avatar hue pulled most of the way to the
divider, so they tell apart without colouring the column. "All branches" has no
single upstream, so each version is measured against every remote-tracking
branch — published once any of them holds it, local otherwise — and its node
and laptop glyph read as they do on one branch. The column mixes branches in Git's
order there, so the two blocks are drawn only when every local
version comes before every published one — the usual case, unpublished work
on top — and a block never holds a version of the other kind; otherwise the
rows say it one by one. (It used to say
"unknown" for every version, which drew empty rings and read as a different
component.) A straight history
— one lane — keeps the CSS rail and the selection's stretch; a search or a
filter keeps the plain rail too, because its results are not a connected
history. Rows keep their
relative date ("2 hours ago"); headings per day were tried and taken out —
they split the column more than they helped read it. Pointing at a lane
names it: an invisible 9px band over each 1px stroke takes the pointer, the
lane steps up to 2px while the others fall back, the nodes on it take its
colour, and a card beside the pointer — the app tooltip's dark surface, the
lane's colour said once by a dot before the name — says the branch's name (from
its reference, or from the merge that brought it in) and one fact: "The branch
you're viewing", "All its versions are in release/0.3.1", "3 versions not in
main yet" or "Not in any other branch yet", from the newest merge and the
versions loaded. A first card with a coloured edge, a version count and a
dated sentence said too much and read as decoration; the one fact is what the
reader asks of a lane. Pointing at a row lifts its lane without the card. Every piece of the
timeline (a row, the local head, the boundary) carries the rows' transparent
1px border and draws its stretch of lane at its own height from that edge: on
a display that paints that border as less than a CSS pixel, a lane measured
from different edges moved by a fraction between rows.

A title reads from what changed: a Conventional Commits prefix
(`fix(settings): `) is one tone quieter than the words after it, and a merge's
whole title is, so the text is intact but neither leads. A search marks what
it matched in the title, and a row found by something it does not show — its
author, its code, a reference, its message — says where in a small accent glyph,
so no row is in the results without a reason on it. `Details` scrolls within
itself at up to 45% of the card: a long message must never push the files and
the diff out of reach.

**File lists can be read in folders.** Changes' list and a saved version's
files in History share one layout switch and one preference: a flat list by
name, or the files grouped in the folders they live in, as an IDE shows them.
Folders are the default when no valid preference is saved, including when
storage is unavailable. An explicitly saved flat-list choice stays respected.
Initial file selection, and the fallback when a selected file disappears,
follow the selected layout's display order: the first file under the first
folder in tree view, or the first listed file in flat view. Navigation from
the command palette, rail or tabs preserves the user's valid selection and
position, including the selected branch, History version, files, scroll and
folded folders. The first item is the fallback only when there is no valid
selection. Links to a particular file or saved version still open that target;
refresh and Back/Forward also preserve a valid explicit selection. History chooses
the right file before reading its diff, including cached version detail.
The switch is a single icon after the rule in the list's search pill — the
part of the pill that acts on the list rather than on what is typed — beside
Filters in Changes; one control rather than a segmented pair, because the
Changes strip already carries the select-all control, the pill and `⋯` in ~300px.
It shows the layout in use and is pressed, in the accent, while the list is
in folders. In folders, a chain of folders that hold nothing but the next one
is one row (`src/features/history`); a folder shows how many files it holds
and, while folded, which kinds of change they are, as dots — an open folder
drops them, because its files below already say their kind; a file under a
folder drops its own folder line; each level steps in 16px with a hairline
under the parent. The project root's own files come last and
loose, as an IDE draws them, and keep the list's row — name and `Project root`
under it — because no folder stands over them: the switch never reshapes a
row it is not grouping. (A `Project root` folder was tried and dropped: it
added a level that grouped nothing and read as one more real folder.) In Changes a folder carries an include control
for everything under it — filled, empty, or half-filled for part of it. `←`
and `→` fold and unfold a folder, and stepping through the files follows the
order they are drawn in, opening a folded folder it steps into. The rows stay
one flat, virtualized list: the tree changes where a row sits, not the DOM. The pill's placeholder is short —
`Search changes` — and the field's accessible name says it in full; its two trailing controls sit tight at 22px, so the
word survives beside the select-all node and `⋯`.

**The Changes include control is a timeline node, not a checkbox.** It is
10px rather than the shared checkbox's 18px, because it stands on every row.
Filled in the node fill is included — the default; an empty ring is left
out, and the row itself dimmed, so the exception is what the eye finds; a half
moon is a folder only partly in. Those are the three states History already
uses, so the list reads as the same timeline rather than a form. The accent
belongs to the file that is open: its node is the one green mark, and selecting
it changes the colour, never the shape. A ring under the pointer says the node
can be pressed without putting a tick back. The visible node is 10px, but the
label around it is 18px wide and the row high and reaches into the row's
padding for a 24px target, so the control costs less width than the tick it
replaced without shrinking what the pointer has to hit. The edge is a 1.5px
mix of the secondary text colour; the shared `.app-checkbox` stays the option
checkbox in the History filter panel and the save box. A search pill with
trailing controls folds its empty clear button away, since those controls
already keep the text off the border.

**Console is a terminal across the workspace, not a panel with a terminal in
it.** It is the one screen without a card: the monospace transcript sits on
the window's own `--surface-app`, with no border or panel around it and no
screen header (the heading stays for assistive technology). A status line at
the foot, drawn as a multiplexer draws one, takes the app status bar's exact
place — 34px, the workspace insets, flush with the window's foot — so nothing
below moves on the way in. Unlike the bar it has no fade above it: the
transcript simply ends against it, and the suggestions under the prompt are
never veiled. It stands in for
the app status bar, which is hidden on this screen alone. Three tracks keep the
search centred exactly as the strip's field is: the confirmation setting leads
as a compact chip — a glyph and one short word, the full sentence in its
tooltip and for the screen reader, tinted in the success tone or solid in the
console's own violet when changes run without asking — the search holds the
middle, and the prompt's keys are split around it: completion and running ride
with the chip, history and clearing with the Settings and shortcut-editor
actions at the right. The two halves are hidden rather than clipped when the
line narrows. The line carries no project facts: unsaved files, versions
to publish, incoming versions and the Git version belong to the welcome, where
they have room, and switching branches, publishing and project settings stay one
rail click away. The search is a small raised card — the app palette's
surface, its subtle border and a small radius, with the shortcut spelled at
its end — and, with the strip gone, it is where Ctrl/Cmd+K lands. The results
deploy from it as they do from the strip's field, then wear the terminal's
pane on this screen: the console surface, the mono face, the accent action
names and the dashed rules the shortcut pane uses. Escape gives the keyboard
back to the prompt so the next command can be typed at once. The prompt takes
focus whenever the screen is shown. Each query repeats the prompt it ran at, as Starship
prints one: a context line of coloured text — the project in the accent, "on",
and the branch it was on in the keyword colour — and below it a bare `❯`, the
name typed, then a ✓/✗/! and the elapsed time, so every command starts at the
left edge however long the branch's name is, with copy and run-again appearing on hover or focus. The exact
fixed Git command follows in the secondary colour, then the output. Output
stays inert text; tones only colour runs by the fixed query's known shape and
fall back to plain text past 400 runs; the whole transcript also shares one
budget of 400 coloured runs, spent newest first, so older output that no
longer fits is shown plain and the screen stays inside its element budget. The transcript follows its end after every command, as a
terminal does, so the next prompt is always in view. The prompt is the
transcript's last line, with a blinking block cursor (still under reduced motion), inline ghost
completion, and a listbox of matching names below it drawn like the shortcut
pane's rows — terminal type, dashed rules, the chosen name marked `❯` on a soft
wash, no card or shadow; there is no send
button. An empty transcript shows a fetch-style welcome: the whole mascot
as ASCII art generated from the drawing (64 columns printed at 7px and
line-height 1, keeping the compact footprint of the v4 welcome, as fetch
tools print their logos; in one tone, the ink
under the GitOdile themes and the accent fill elsewhere, deepened toward
the text on light schemes so thin glyphs stay visible, with the white belly and
eyes left as holes) and, behind it, a dim rain of hex digits: the short ids
of the project's latest saved versions, read from the history the app already
holds (a seeded stand-in while there is none), falling in the body's colour and passing behind the silhouette
(see Motion), beside a summary drawn as Omarchy's fastfetch draws one: two framed groups,
each titled in its frame and drawn in its own theme colour — "project" in the
accent (name, branch, unsaved changes with added and removed lines, versions to
publish and newer ones available) and "environment" in the keyword colour
(GitOdile version, Git version, the theme actually drawn and whether changes
are confirmed, in violet when they are not) — with a Lucide icon on every row, then a row of round dots in the
theme's accent, status and syntax colours, as a terminal's welcome shows its
ANSI palette. The summary uses snug row leading, compact frame padding and
12px gaps; its loose 10px palette dots are spaced by 4px. At normal console
text size the whole block is about as tall as the compact mascot, without
shrinking the text or fixing its height: larger text and long values may grow.
The mascot sits level with the summary's top, and the summary
keeps its height while facts are read: the changes, publish and provider rows
are always drawn, with a dim dash while their reading is unknown or failed,
and a re-check keeps the last value, so an edit the watcher picks up never
makes a row come and go or the mascot move. The dots stay loose rather than framed, since they are
decoration next to two groups of facts, but start where the frames' rows
start, under the icons. The mascot has no frame either. Its eyes blink with
Home's uneven rhythm, including the occasional double blink, by swapping only
the ASCII eye cells; the drawing and prompt stay still. Submitting the first
entry sends the welcome's drawing to a small watermark in the bottom-right
corner: the same drawing shrinks and travels there in 460ms on the emphasized
curve, fading to the watermark's opacity, and its rain shows once it lands.
The watermark is approximately 170px wide at 32% opacity on light schemes and
16% on dark ones, with its rain kept at an effective 20% opacity in light
schemes. Behind the watermark the rain falls through the mascot's whole
column, from the overlay's top edge down to the foot row and as wide as the
drawing, slower than the welcome's and with two drops a column so the taller
strip stays as dense. Each later entry blinks the watermark's eyes once
(220ms, the idle blink's frames). The watermark sits behind the full-width text,
outside the scrolling log, with no pointer, selection or accessibility target.
It is inset 24px above the terminal body's edge (so the shortcut pane and footer
stay clear), with two extra character rows under the feet and a size that fits
short panes. Rain ends on the last ASCII row of the feet, above the protective
padding, so the falling characters and the mascot share one imaginary ground.
Only the rain is masked; the feet are never clipped. Results and
later commands retain the drawing without replaying the entrance. Clearing the
transcript, including Ctrl+L, sends the drawing back the same way: it grows
from the corner into the welcome while the summary fades in behind it.
Without the Web Animations API both moves fall back to a row reveal over
about half a second.
The welcome setting controls both appearances. The initial welcome drawing
is already complete when Console opens; only a command that moves it down to
the watermark, or clearing a nonempty transcript that brings it back up,
reveals it. Clearing an already empty transcript does not start an entrance.
Hidden screens pause the repeating motion and finish any pending entrance;
returning to the console never replays it. Reduced motion shows the finished
static drawing immediately without blinking or rain.
The frames are borders rather than box-drawing glyphs, so no font
leaves gaps in them. The transcript scrolls with the app's shared auto-hiding scrollbar (thin, no
arrows), never the platform's default one, and as terminals do it shows only
while the output is scrolled or the pointer moves over it, fading 1.2s after
and at once when the pointer leaves — the always-focused prompt does not keep
it lit. The shortcut editor
is a pane split off the terminal's foot, as a multiplexer splits one: full
width above the status line with a rule over it, the transcript giving up the
height it takes, with the transcript kept scrolled to the prompt as the pane
opens or closes. It uses the full width, in the terminal's own type: a single
header line with the title, the note, "restore defaults" and `esc`, then the
rows in as many columns as fit (name, query, quiet actions, dashed rules), the row being renamed marked `~`, and a prompt-shaped line
(`+ name → ‹ query › ↵`) to add or rename, where the query is a terminal-style
picker stepped with the arrow keys or its arrows — a spinbutton that announces
the query's name — rather than the platform's select menu; Esc cancels a rename, then closes and
returns focus to whatever opened it — the status line's icon or the prompt. No
second dashboard or persistent transcript is added.

**Branches has no page row either; the list panel's header is the screen's name.**
It follows the Work screen's shape: the list panel opens with a header at
`--strip-height` — the rail's Branches glyph in the accent and the word in the
tab's title type, the way Work's active tab is set — and its search strip
steps down to `--strip-height-inner` under it. The row that used to sit over
both panels held the name, a sentence about what a branch is, and "New branch";
with the docked composer under the list starting branches, it was a name the
rail already states, and the panels now start where the screen does.

Its detail panel is one surface divided by rules, not a tray of cards. It
opens with the branch's strip, a fixed `--strip-height` level with the list's
header, the way History's version strip is level with its tabs. It is one
line, and the name has it, at `--text-subtitle` (a step above the rows', the
size History's strip gives its subject) with its prefix quiet as on the row
(`release/` before `0.4.0`): the row's active glyph before the name when the
project is on this branch (the word stays for a screen reader), then, at the
trailing end, who last saved to it as the shared author avatar ("You" for the
user's own, the name on its tooltip) and when, said relatively ("2 minutes
ago") as the list beside it says it, with the exact date on its tooltip. A
second line with `Latest saved` and the author spelled out, and an `Active`
capsule beside the name, made the name compete with its own facts. Then the
branch's actions at the trailing end — Switch as the one
labelled action, a capsule with a hairline and no fill, and Rename and Delete
as the icon-only circles History's version strip gives Details and More,
named on their tooltips (Rename's names its F2), Delete's glyph in the danger
tone. They were three grey capsules, the heaviest strip in the app beside a
list just made lighter; a labelled capsule next to circles reads as the
primary one without spending the accent, and Switch keeps its word because it
is what the reader came to do. The upstream is
not in the strip: the first state under it names it, or says there is none,
in a sentence about where the branch stands, and the strip saying it again was
the panel repeating itself across a rule. **Where the branch left the main branch
is drawn, between where it stands and its versions** — a "Route" section,
the project map's reading in miniature for the one branch selected. Time runs
to the right. The main branch is the top lane in the panel's quiet ink, its
dots the versions it has saved since the two parted; this branch leaves it at
the version where they parted — a ring, the date under it — and runs along a
second lane in the accent, one dot per version of its own, the ones not yet
published hollow on a dotted stretch, and a ring round the end when it is the
active branch. A branch that came back by a merge draws the whole excursion: it
leaves at the parting, runs its lane with the versions it saved while away,
curves back up into the main branch at the merge — a filled mark, its date
under it — and the main branch goes on with what it saved after. The main
branch's versions between the parting and the merge sit on their own stretch,
kept off both ends. A branch whose versions were always the main branch's own —
fast-forwarded into it, or never saved to — never left it: it is a mark on
the main lane at its newest version, and the drawing is one lane tall; Git
keeps no record of an excursion there, and none is invented. **A branch merged
by squash or rebase came back as copies**, and is drawn so: the same
excursion, its way back fainter and landing on a ring rather than a filled
mark, and the sentence saying what happened — "Its work came back on 18 Sept
squashed into one version; the 4 original versions are only on this branch."
To Git the branch is still away, and the drawing does not pretend otherwise:
the work is on the main branch, the versions on the lane are not. It is found
by comparing changes rather than commits (`git patch-id --stable`): the
branch's whole change since the parting against each of the main branch's since
(squash), or each of its versions' against them (rebase) — read only, for the
selected branch, and given up past a thousand of the main branch's versions.
Such a branch can be deleted: the delete dialog says where its work is
("already on “main”, combined into one version") and that GitOdile
keeps a local recovery point with the original versions first, and the toast
that reports the deletion says the point was kept (ADR 0016). A branch whose work is nowhere else is still
refused.
**Every dot is a saved version.** Each lane is drawn from the versions the
route sends with it, newest eight at most: the dot's tooltip is the version's
subject, date and short commit, it grows a step under the pointer, and a
press opens that version in History on the branch it belongs to — the route's
dots and the list of saved versions under it lead to the same place. The dots
are for the pointer only; the list is the same answer for the keyboard.
Past eight, the lane says how many earlier versions it leaves out ("+33")
over its oldest drawn dot, and the sentence under the drawing says the numbers ("Left main on 12 Sept. 5
versions of its own. main has 3 new versions since."), which is
also what a screen reader hears. How many are not published is not in it: the
state over the route says that ("3 not published"), with Publish beside it on
the active branch, and the drawing shows them hollow; the drawing is hidden from it. It is measured
against the main branch always, the remote's default: "where did it come from"
is asked of the main branch, whichever branch is active. The states over it count
against the same branch — "3 versions not on main", "Already on main", for the
active branch too — and while the route is drawn those two states give way to
it, since its sentence says the same count: a fact is said once. The number
and the dots are one answer;
counted against the active branch they disagreed whenever the reader stood
anywhere but main. A project with no main branch gets no count rather than a
count against something else in the same words. The main branch itself, a
project with none, and a shallow clone — where the parting Git reports is
where this machine's history stops — draw nothing rather than a guess. The
figures come with the selected branch's history read — the merge base, the two
sides' counts and their newest versions, and for a branch that is back on the
main branch the first-parent walk that finds the merge — never one read per
listed branch. **It is read fast and waited for in place.** The questions that do
not depend on one another are asked side by side, because on Windows the
reader waits on process launches more than on the walks. The check for work
that came back as copies — the slowest part, a patch read of both sides — is
asked only when the main branch saved something since the parting, since
nothing can have come back otherwise; and what the branch changes is one
`--numstat` for the totals. A row the pointer rests on for a moment starts its
branch's read, so the press usually finds it answered — but only while no other
branch's read is out, so the pointer never competes for Git with the read the
detail is waiting on. A history read is superseded only by a newer read of
the same branch (`authorize_repository_read_of`): before, any branch's read
cancelled the one still out, and resting on a row while the selected branch
loaded left its route waiting for an answer that never came. While the read is out, a branch that will have a route keeps the
section's whole place with the main lane already drawn and named, and a
text placeholder where the sentence will be — the answer grows into a
space that was waiting for it rather than pushing the versions down when it
lands. The first result appears complete as soon as it is available, without
tracing lines or revealing its dots in sequence. **From one branch to the next
it cross-fades.** Two routes share most of their pixels — the main lane, its name,
the parting at a fixed place, the general shape — so blinking the section out
and drawing the next one from nothing made two similar pictures look like two
unrelated events, and it was most jarring exactly when the read was fast. The
previous branch's drawing is held, quieter, while the next one is read (in
place of the empty lane), then laid over the new one and faded out as the new
one fades in, in 200ms: what the two share stays still and only what differs
dissolves — the same idea as the window's theme cross-fade. Morphing the dots and
curves from one position to the next was weighed and left: animating a
path's shape is not supported in the WebKit that GitOdile runs in on macOS,
and a transition that only works on one platform is not one to design on. It
is not drawn beside the list: the list's rows are branches ordered by name or
date, not versions, and a lane joining two neighbouring rows would claim a
kinship the order does not have. **A branch is renamed in its strip,
not in a dialog.** Rename — from the strip, the row's menu, or F2 on the row —
makes the name itself editable where it stands: the same type, size and
place, the letters not moving by a pixel, with one straight accent line
under the text fading in to say it now takes typing (red while the name would
be refused). No fill and no radius: a rounded fill on a box one line tall bent
the line into a curve under the letters that hid them. It arrives with the part after the last `/` selected — `updater-ui`
in `feat/updater-ui` — since that is what a rename usually changes. It used to
swap for a mono pill, a different typeface a step to the right, which read as
a jump rather than an edit. The strip stays one line: the avatar and the time
at its trailing end fade into what renaming does and does not touch ("Only
the name changes — it still tracks `origin/…`", after an info glyph), into why
Git would refuse the name, said before the press by the composer's own mirror
of Git's rules, or into why it did, both in the danger tone after an alert
glyph. Each is cut to a capped width so the field keeps room to type, with the
whole sentence on its tooltip; a strip narrower than 480px keeps only the
glyph. The note used to be a second line under the field, which lifted the
name off its row the moment it became editable. Switch, Rename and
Delete fade into two of the strip's own circles, Cancel and Rename — the check
in the accent, never a second filled button beside the list's Create. Enter
renames and Escape gives the name back with the same fade, out and then in.
While the rename runs the field stops taking typing and the check turns into
the spinner in its place, nothing dimmed. Once it is done the new name lights
once in the accent in the strip and in its row together, the row having
changed with the same answer. The strip keeps its height, so nothing on the
panel moves.
A rename moves no saved version and no file, and the dialog it replaces was a
title, that same field and two notes over the screen that already shows the
branch. The lock is taken at the press and released when the answer is in, the
composer's rule. Under the strip, where the branch
stands — its states without a heading, since each
says what it is — then the versions, whose label carries "Open in History" at
its far end: the list is a preview of the sequence History draws in full, so
the way to all of it sits beside its name rather than in a footer band of its
own. The strip may grow only in a one-column window, where nothing beside it
has to be level with it. A card inside a card is two borders describing one
thing.

**A new branch is named in the same docked composer Changes saves from.** The
box under the list is built and behaves as the save box does (see Changes):
a section of the panel with a hairline over it; at rest the name field — a
pill, the name in mono — with its button beside it; open, the same box grown
upward. Its plan line is where the new branch starts — "Create from `main`",
known locally, so it is there from the first frame — and when the default
branch and the active one stand at different commits the choice between them
is made in that line, both by name in the same mono, the default one telling
what it is on its tooltip and keeping its width while the active one's name
gives way. On a detached `HEAD` the line explains the one honest starting
point instead. "Switch to it" is a checkbox in the foot, and the button says
the consequence — "Create and switch", or "Create branch" — named apart from
the dialog's own "Create", since the two can be on screen together. At rest,
where the button shares the field's row in a column under 300px, it says only
"Create", so the field's question is not cut; its accessible name is still the
consequence, and opening the box — which is where "Switch to it" appears —
shows the consequence in words beside the choice that decides it. Created,
the plan's slot says what was created. What Git would refuse in the name is said under
the field before the press, in the shared `.field-error` look, by a local
mirror of Rust's own checks (`checkBranchName`: `check-ref-format --branch`
and the loaded branches, exactly or by letter case) — Rust stays the authority.
What typing on cannot fix — a space, a forbidden character, a taken name —
is said as it appears and holds the button; how a half-typed name ends
(`feature/`, `v1.`) is said only when the reader asks to create, so the box
never scolds a name for being unfinished. The field asks what the branch is for
— "What will you work on?", the way the save box asks "What changed?" — and
while it is empty, the line under it says how a name is written: "Like
`fix/short-name`", one line in any language, the example truncating rather
than wrapping and whole on its tooltip — by an example
in the project's own convention when it has one (the prefix at least two of
its branches share, `fix/short-name`) and `feature/new-feature` otherwise. The
example used to be the placeholder itself, which told the format and never
the purpose; it gives way to what Git would refuse once there is a name. Nothing
in it moves: an example that types and erases itself would be a second
moving thing on a screen that keeps one. When it folds is the same shared rule
(`useDockedComposerFocus`). It is the screen's one way to start a branch: there
is no "New branch" in a header and no "new branch from here" among the active
branch's actions, since both opened a form for what the box already does. The
dialog with its full plan stays for the palette's "New branch" and the
detached-`HEAD` banner.

**The quick switch makes a branch in place too.** In the status bar, "New branch" — and a search that names no branch, offered as the last
row, "Create “feature/login”" — open the composer's own fields docked at the
popup's foot, where the footer was, under the list that stays: a title row
("New branch", and an × back to the footer), where the new branch starts, the
name, "Switch to it", and the button that says the consequence. It docks
rather than replacing the list because the popup is measured and placed once,
for the list: a view that replaced it shrank the popup to the composer's
height and left it hanging — above the status bar, a gap opened between the
popup and its trigger. Docked, the popup keeps its size and its place and the
list gives the composer the room, as the Branches list does. Escape folds it back
into the footer and leaves the popup open. It is the same flow (`useLineCreateFlow`) in a second frame, so the
two cannot explain one create differently. A search row opens this view with
the name in it rather than creating at once — a search is a question, and
Enter on it must not make a branch by accident. Made, the popup closes: the
control it hangs from names the new branch, which is the confirmation. A
failure stays under the field to retry.

**The quick switch is one popup, in the status bar.** It opens at 400 ×
400px with nine rows and their controls; Overview's header once hosted a
second one and no longer does (it names where the project lives). A smaller
popup left the docked composer no room for the list it docks under. It has the
project popup's shape (task 189): a head with the branch the project is on — its
glyph on the active fill, its name, its latest saved version — and "Copy name"
beside it over a hairline, then the search, the rows and the foot. The search
still takes focus on opening. The keyboard walks it as one control: Down from the search moves
into the rows, Up and Down walk them, Up from the first returns to the search,
and Enter in the search chooses the first row it left — only a choice, since
the switch it starts is previewed like any other.

**The quick switch states a branch's actions where the branch is.** Each row carries
an always-visible `⋯` — not a hover-only affordance — that shows that branch's
actions in place of the list: merging it into the current branch, rebasing the
current branch onto it, and comparing the two. Each names both ends so the
direction is never inferred. None is enabled yet — the flows are not built — so
each is stated, disabled and marked `Soon` rather than hidden. Renaming and
deleting a branch stay on the Branches screen; the row's menu does not duplicate
them. They replace the list inside the popup rather than opening a nested menu,
because that popup clips its overflow and dismisses on a press outside itself.

**A branch's right-click menu groups what other Git clients group.** Going to
it (Switch); what it can do with the branch the project is on — "Merge into
“main”", "Rebase “main” onto this", "Compare with “main”", the quick switch's
own three in its words, each naming both ends — stated, disabled and marked
`Soon` until their flows exist rather than hidden; renaming it and copying its
name; and, after a rule, Delete, the one destructive action, last. The three
are offered only for a branch that is not the active one: the active branch has
nothing to merge into itself. Switch wears the glyph the detail strip's Switch
does, and compare its own, so no glyph means two things across the screen. The
rules between groups are `.app-menu__divider`, the one rule every menu in the
app draws — a top border, so it lands on a whole device pixel and weighs the
same in every menu at any display scale.

**The panel does not scroll; the section that can outgrow it does.** Where a
branch stands is three lines that never grow, and a panel that scrolls as a whole
carries them off the top to reach the list underneath — the answer leaving to
show the question. The body divides its height between the sections instead,
and the list of versions takes what is left and scrolls inside itself, which
also keeps the way through to History against the bottom edge where a way out
belongs.

**Under the route, what the branch can do.** "What you can do" states the quick
switch's actions for the branch on screen, in the quick switch's and the row
menu's own words, each naming both ends: an action is called the same
wherever it is offered. For another branch the other end is the active one:
"Merge into “main”", "Rebase “main” onto this", "Compare with “main”". For the
active branch it is the main branch the route measures against: "Merge “main”
into this", "Merge into “main”" (left out once the branch came back) and
"Compare with “main”". Nothing is offered on the main branch itself or with no
branch checked out. Each row is a glyph tile, the action, and what it would do
in plain words in one line under it: how many versions it would carry, or, for the comparison,
the totals since the parting ("448 files changed since it left · +45,972
−6,996"). None of the flows exists yet, so every row is stated and marked
`Soon`, as rows rather than disabled buttons. A row that could not run anyway
says why instead ("Up to date" when the main branch hasn't moved). This
replaced a list of the files the branch changes against the main branch: a
preview of the comparison it could not open was a long way to say "Compare".

**Each fact is stated once on a panel, in the place that says it best.** This
panel used to close with a Status table whose five pairs were all answered
above it — the upstream by the header, the count by the strip, the date and the
hash by the latest-version section — which in turn described in full the same
saved version the list under it opened with. A screen that repeats itself is
not thorough; it is a screen where the reader has to check whether the second
statement means something new. The upstream is named in the header, who last
saved and when in the byline, and every saved version exactly once in the list.
The list draws History's timeline in small: each row's node on a rail says
where the version stands (half filled while only here, a solid disc in the
node fill once published, an empty ring when there is no remote copy
to count against).
Which versions the remote lacks is asked of Git with the history read
(`<branch>@{upstream}..<branch>`), not read off the ahead count by position: a
branch that merged another interleaves the two by date.
Where the branch is ahead of its remote copy, the versions only here sit under
an "On this computer" chip on the rail — also when every listed version is
one of them, on a branch further ahead than the list shows — and a
"Published" chip marks where the remote's copy begins when it is in view —
Overview's `TimelineChip` at its compact size, no count and no rule, the
remote in the "Published" chip's tooltip. While the list scrolls, the chips
stay at its top as their versions pass, as Overview's do. **One Publish per
branch**, History's quiet capsule with only the cloud in the accent: on the
active branch it rides the "On this computer" head, beside the versions it
sends, as History's does; only a branch with no head — never published, or
whose remote branch was deleted — carries it on the remote state above
instead. Two at once had the same button twice on one screen. Another branch
is published from that branch.
No chip repeats it, and a row's code shows under the pointer. The list takes
the height the actions leave and scrolls inside itself, with no count of the
versions it leaves out: "Open in History" over it is the way to them, and
every row opens that version in History — the screen that draws the same
sequence in full.

**A third screen asking the same question uses the same surface.** Branches
filters a list the way Changes and History do — a trigger with a count, a
panel, groups of capsules and switches, a footer that clears them — and had a
private copy of every rule for it. The copy is what a private copy always
becomes: it had never picked up the shared sheet's fix for a `<legend>` not
being a grid item, so `Sort by` sat flush against the capsules under it where
the other two screens give it 6px. What a feature may still own is the part
only it has — here, the group listing name prefixes, which grows with the
repository and therefore scrolls, the way the file-type group in Changes does.

**A drawing has to say more than its caption does.** The strip opened with a
rail of dots — one per version the read returned, hollow at the left for the
ones behind them, `Older versions` and `Newer versions` written under its two
ends. Every branch that had filled the read drew the identical picture, so the
only thing the rail could tell you was "there are more than eight", and the
count standing beside it said that in words. A diagram that needs a legend to
explain what it is, and then encodes one bit, is decoration with a caption on
it; the pixels went to who saved the last version and when.

**A state and the sentence explaining it are one line, not two.** Given the
whole measure of a panel, `Up to date with the remote — Your local branch is in
sync with origin/…` reads as what it is. Stacked, it spent two lines and a gap
per state to fill a third of the width, which is how the panel ended up wanting
two columns it did not need: three short sections beside each other, and a list
of subjects truncated at half measure. The sections take the full width and the
grid is one column again.

The heights are a `calc` off `--control-height-sm` rather than sizes of their
own, for the same reason a control's height is a token: a strip is the control
that lives in it plus its air, so it cannot be right at one number and wrong at
another. There is no screen header above them to measure: Changes, History and
Branches head their list panels instead (§ Core screens, "the panel is the card"),
and the shared page row they used to open on — `.screen-header` — went with the
last of them. It had been one rule rather than a copy per screen because two
hand-written copies had already drifted: the panels beneath started 12px lower
on the screen whose header carried a button, and the same 22px title did not
measure the same on two screens. A screen that wants a page row again starts
from that lesson, not from a private copy.

There are no exceptions. There was one — the History diff pane's footer ran its
buttons at 30px, below even `sm`, on the grounds that the pane around it is a
code surface with its own measure. It went with the footer: stepping between
changes is now the same arrow pair the Changes diff header carries, in the same
place, and an icon-only stepper is not a labelled button at all. A control that
seems to need a size of its own is usually a control that has been given the
wrong shape.

A guard in `styleComposition.test.ts` fails the build on any feature rule that
gives a `.primary-button` or `.secondary-button` its own height, font size or
`min-height` — the exception above is allowlisted there by name, so adding a
second one is a deliberate edit to the guard rather than a quiet override.

### Icons

Sidebar navigation and inline controls use [Lucide](https://lucide.dev) icons (`lucide-react`, ISC), imported by name so unused icons are tree-shaken out of the bundle. Chosen over hand-drawing our own because it ships real Git-specific glyphs (`GitCompare`, `GitCommitHorizontal`) instead of the generic pencil/clock metaphors the app used before — see the icon-library comparison done when this was decided. An active nav item tints its icon with `--accent-primary`; the label stays `--text-primary-color`. Don't mix in a second icon library or hand-drawn icons alongside it — pick the closest Lucide glyph even when it's not a perfect semantic match.

**An icon's size is a role, never a number.** Fourteen sizes from 10 to 25px
had grown one screen at a time; a glyph now takes the token of what it sits in:

| Token | Size | What it sits in |
| --- | --- | --- |
| `--icon-badge` | 10px | A badge or a corner chip over something else |
| `--icon-meta` | 12px | Beside a caption or a label: a chip, a hint, a selection check |
| `--icon-row` | 14px | A row, a field or a compact control |
| `--icon-control` | 16px | A menu row, a button, a search field |
| `--icon-nav` | 18px | A navigation entry, a dialog's close |
| `--icon-tile` | 20px | A glyph tile, a state glyph, the rail |

A glyph sized through its own class — a chevron, a caret, a file-type icon, an
indicator — is still an icon and takes the same roles as one sized through an
`svg` selector; thirty-five had escaped that rule at seven sizes.

**Publishing is the cloud with the arrow** (`CloudUpload`), wherever the verb
appears: the band's Publish step, the node on an unpublished version in Recent
history, and the Publish buttons in the save and publish dialogs. It pairs with
the status bar, where the remote is already a cloud (`CloudCheck` when all is
well, `CloudAlert` when not), so "publish" reads as "send it up to the cloud
you can see". It replaced the paper plane (`Send`), whose ink sits low and left
of its box and never centres in a small circle. "Not checked yet" and the
states with no remote to speak of take the plain `Cloud`; "review and get" is
`ArrowDownToLine`. The changelog's `send` highlight glyph is content, not this
verb, and keeps its plane.

**The cloud is the remote, and only the remote.** Every cloud glyph speaks of
the project's copy on its hosting service: publishing (`CloudUpload`), its
state (`Cloud`, `CloudCheck`, `CloudAlert`, `CloudOff`), bringing its newer
versions down — cloning a project or the status bar's Get — (`CloudDownload`),
and getting and publishing in one confirmation (`CloudSync`). Updating
GitOdile itself has nothing to do with
that remote, so it never borrows the cloud: the app's updates are the circle
with the arrow — `CircleFadingArrowUp` where the reader goes to look (the
update entry in the overflow menu, the restart dialog's header, the Updates
section in Settings, and the `circle-fading-arrow-up` release highlight), and
the solid `CircleArrowUp` once a newer version has actually been found, the
overflow menu's update entry included. The fading ring
completing into a whole one is the same glyph saying "there is one".

That rule governs **controls** — the glyph vocabulary a user learns to operate the app. It does not govern **artwork naming somebody else's product**, which Lucide has no glyphs for at all: file-type icons in the Changes list, and the stack and operating-system marks in About. Those come from the vscode-icons set already installed for file types, or — for the three OS marks, which that set does not carry — are drawn in `src/app/vendorMarks.tsx` and used nowhere else. They keep their vendor colours, because a logo reduced to one ink stops being recognizable at 14px, which is the only job it has. That is the trade: About accepts a handful of fixed colours it does not own so that nothing else in the app has to. The exception is a mark whose brand colour is an ink rather than a hue — Apple's, monochrome by its own definition, and Tux's black body, which is a hole in the layout on the dark dialog surface. Those take `currentColor` and the dialog's own surface, so they are legible in both themes; what identifies Tux at 14px is the silhouette and the yellow beak, not which side of the ink it is on.

**A project's identity icon says what the project is.** The status bar, its
project popup and the welcome recents draw one chip per project. A per-project choice
— an emoji chosen by the user, or the two letters — wins; otherwise the chip
follows the app-wide **Interface → Project icons** setting, which offers three
styles and defaults to **Technology**: the language or framework detected from
the project's own root manifests (a desktop platform such as Tauri first, then a
framework, then a language — a bounded, read-only local scan, see
`src-tauri/src/technology.rs`); **Initials**, the colour-and-initials chip the
app has always used; or **Random**, a stable emoji per project, drawn from the whole picker set, that the user
can then replace in that project's own settings. The detected mark is vendor
artwork from the same vscode-icons set with its own colours, so it sits on a
neutral tray rather than the identity colour; the emoji uses the system emoji
font and is sized from the chip rather than from the initials' text, because
bundling a colour-emoji font for a decoration is not worth the weight. A
per-project choice is stored per machine, keyed by the project, never in the
  repository, and the project's own **Project settings → Icon** section is where
  it is picked or returned to automatic. The chip is a rounded square (`--radius-identity`) — a project, not a person, and in the rail it stands apart from the round controls beside it. It keeps `--avatar-ring` and stays
  fixed across themes: the choice is identity, not theme. A closed recent
  project keeps its last detected mark across restarts; an entry never triggers
  a repository scan merely because the welcome screen appears.

Brand identity is not window furniture. Neither the titlebar nor the rail carries a mark or a wordmark: a 40px lockup at the top of the rail once spent that column's most valuable real estate on something that never changes, and a mark in the titlebar corner later did the same to the toolbar. The mascot appears where the app is being introduced or described: the no-project welcome screen and About. The compact layout below 800px adds no wordmark either; the window title and the operating system name the app.

Home shows the full mascot beside its greeting (116px wide): the first time in a session it draws itself, and it blinks now and then. About shows it at hero scale, winking in step with the light across the wordmark (see Motion). Inside the app the mascot's body follows the theme (ADR 0013) and its belly, toes and eyes are holes that show the surface behind it, so the silhouette alone is the identity in every palette. The GitOdile themes, and the system default, draw it in the ink — black on light, white on dark — since they spend no colour on the interface (ADR 0033). Other themes use their `--accent-primary-fill`, lifted to at least OKLCH lightness 0.72, the brand green's own, so the body stays the same light shape; this matters for the dark accents of Catppuccin Latte, Solarized Light and Gruvbox Light.

About leads with the mascot at hero scale, then the name, then the promise, all
centred. The mascot is the full body with its theme fill, never a tile; the name
takes `--text-hero` and the promise `--text-title`, so the hierarchy comes from
the scale rather than from three ad-hoc sizes. The running app version sits
directly below the promise, and the line under it is the one thing About can
honestly say about updates — "Up to date", or whichever state
the release model is in — with the link to What's new beside it, which closes
About onto Settings › Updates at that group. Version and update line come from
the same release model as Settings › Updates, so the two cannot describe one
build differently; the line is read-only and About offers no update action. The line names the state it is in — "Up to date" when the build is
current, "Not checked yet" before the first check, "Updates unavailable" when
the build carries no feed — so it is never blank, and the slot reads as a state
rather than a fault. Only a failure About cannot explain stays silent, because
an alarm with no next step is worse than a quiet line.

About opens from the titlebar's overflow menu and from the command palette. The titlebar once also opened it from the mark in the corner, the convention of clicking the identity; that route went with the mark.

Hosting provider icons use monochrome silhouettes with `currentColor`, including
GitHub, GitLab, Bitbucket and Azure DevOps. They follow the surrounding ink in light/dark themes and
selected states, rather than introducing provider brand colours into navigation.

### Honest affordances

A control that does nothing yet must not look fully interactive. Navigation entries for screens that don't exist yet (e.g. Changes, History, Recovery before their flows are built) are rendered `disabled` with reduced opacity and a visible “Coming soon” status, rather than looking clickable and silently failing. An upcoming primary-card action may remain visible when it makes the planned next step clear, but it must be disabled and honestly marked as unavailable. Replace the disabled state with a real view as soon as the screen exists — don't leave it disabled out of habit.

### Theming: two layers and multiple themes

Colour is two layers, and a theme is a record that fills only the second one
(ADR 0012).

**Identity colours (never themed).** `--avatar-color-*`,
`--avatar-foreground`, `--avatar-ring`, `--tooltip-*`, `--console-root` and
`--tone-app` are declared once in `src/styles/tokens.css`. No theme may set
them.
`--avatar-ring` is a neutral dark edge the project chip carries so it stays
separated from the lighter panels of some community palettes (Nord, Catppuccin
Frappé) without a per-theme colour override. It is drawn in dark schemes
only — `light-dark()` against each theme's `color-scheme` — because on a light
panel every swatch already clears 4.5:1 and the edge only read as an outline.
This layer is identity, not
action: the actionable accent is `--accent-primary`, which the theme owns, so
the primary action, the notification badge, the attention halo, navigation and
focus all follow the theme rather than fighting it. The brand lime is not a
token: the interface draws the mark in the ink (ADR 0033), and the lime lives
only in the app icon's sources (`scripts/icons/mascot.mjs`).

**Theme colour tokens.** Surfaces, text, borders, the semantic accent
(`--accent-primary`), status, diff, syntax, focus, overlay and shadows. Each
theme is a `[data-theme="<id>"]` block in `src/styles/themes.css`, which also
sets `color-scheme`, plus a record in `src/shared/theme/themes.ts`. The
official palette is **ink** ([ADR 0033](docs/adr/0033-official-monochrome-themes.md)):
warm stone greys (Tailwind's stone scale, the warmth GitOdile always had), the
text's own ink as the accent and as the fill of solid actions, with inverted
text on it, and hover, selection and the accent wash as ink washes. Colour
belongs to content and meaning, not to the interface: the diff, danger,
warning, success and the remote's blue keep a toned-down hue, and what
identifies a thing — project avatars, file-type icons, technology marks, the
History lanes — keeps its own colours. Every named theme keeps the same token
set, so switching leaves no value behind.

| Token | GitOdile Light | GitOdile Dark |
|---|---|---|
| `--surface-app` / `-panel` / `-raised` | `#f8f7f4` / `#ffffff` / `#ffffff` | `#0c0a09` / `#1c1917` / `#292524` |
| `--surface-code` / `-control` | `#f5f4f2` / `#f2f1ee` | `#201d1b` / `#24201e` |
| `--text-primary-color` / `-secondary` | `#1c1917` / `#625d58` | `#fafaf9` / `#a8a29e` |
| `--border-subtle` / `-divider` / `-control` | `#e7e5e4` / `#dedad6` / `#d6d3d1` | `#312c29` / `#3b3532` / `#44403c` |
| `--accent-primary` = `-fill` / `-contrast` | `#1c1917` / `#ffffff` | `#fafaf9` / `#0c0a09` |
| `--surface-hover` / `--surface-active` | ink at 5% / 8% | ink at 6% / 10% |
| `--focus-ring` | `#1c1917` | `#fafaf9` |
| `--status-success` = `--diff-added` | `#38624c` | `#93c48a` |
| `--status-danger` = `--diff-removed` | `#a83a32` | `#f08a80` |
| `--status-warning` | `#7a5714` | `#dcb064` |
| `--status-renamed` (the remote's blue) | `#2a66a6` | `#7eb0f5` |
| `--tone-local` (saved here) | `#45770e` | `#bbd950` |
| `--accent-heart` (raspberry, apart from danger) | `#bd3073` | `#f673b6` |
| Syntax | greys | greys |

With an ink accent, colour no longer sets a link apart from the words around
it, so an inline link is underlined at rest (WCAG 1.4.1).

**Glyph tones.** Since the interface spends no colour, a glyph's colour says
what kind of thing it stands for — never that it is pressable. Declared once
in `tokens.css` and `themes.css`, so every palette and scheme keeps them in its
own hues and contrast. Each reads apart from the others and from the status
colours: the local lime is not success's green or an added line's, and the
favourite's raspberry is not danger's red. There are two greens and each says
one thing: lime is waiting here, green is done. In every theme each
pair of tones — remote, local, done, warning, danger, heart and app — sits at
least 10 apart in OKLab (×100; about 2 is the smallest step the eye notices),
and the contrast contract below measures it. That is normal vision only: under
colour blindness red, amber and the greens meet in any palette, which is why a
tone never carries a meaning without its glyph. A community theme reaches the
floor with its own palette: each role takes another of its published hues,
moved only in lightness — saved here a teal, frost or second green beside its
success green, the heart its pink, magenta or purple — and its block in
`themes.css` names what moved. Solarized and Gruvbox Dark have no hue left
over, so their saved-here is the remote's own hue at another lightness: the
floor holds, and the laptop and cloud glyphs tell the two apart. A tick that marks the chosen
option in a menu or picker is selection, not success, and stays in the ink.

| Tone | Token | Means | Where |
|---|---|---|---|
| Remote | `--tone-remote` = `--status-renamed` | the remote and its copy | the origin cloud, a published version, Clone, Get changes and Connect a remote dialogs, the "new versions" and "published" notifications |
| Local | `--tone-local` (theme token; the brand's lime in the official themes, a hue of its own palette apart from success in community ones) | saved here, not published | "On this computer" in the timelines of Overview, History and Branches, the Save version, Publish, Restore and Create project dialogs, Get-and-publish |
| Done | `--status-success` | finished, all in order | every completion tick: "All in order" in the next step, done steps in dialogs and Home's setup, a saved version, a created project, "Everything is saved / published", "up to date" in About |
| App | `--tone-app` (violet, per scheme) | GitOdile itself | Keyboard shortcuts, Report a problem, the restart dialog and the "new version of GitOdile" notification |

Notifications take the tone of the dialog each one opens, and the status
tones only for what asks for a decision: a line gone from the remote and a
check that failed are `--status-warning`. The status tones `info` and
`success` are not notification tones: under the ink accent `info` drew the
glyph black.

**A glyph's circle is never coloured.** The tone goes on the glyph alone; the
disc or tile behind it stays neutral (`--surface-control`, `--surface-panel`
or `--surface-hover`) in every tone — status or glyph — and in every theme.
A filled or washed circle spent the colour twice and made a quiet header
glyph read as a badge. Menu items stay in the secondary ink; the colour is
spent on the header glyph of the dialog an item opens (`Dialog`'s `tone`). "Only on this
computer" is one shared piece, `LocalOnlyIcon` and `LocalOnlyMark` in
`shared/ui/localOnly.tsx`, so its glyph and tone change everywhere at once.

`--surface-active` is an ink wash in the official themes; in a community theme it is tinted with that palette's accent.

Syntax colours are in `src/styles/themes.css` with the rest; they are not
repeated here.

**The contrast contract.** `src/architecture/themeContrast.test.ts` measures
every pairing the stylesheets actually paint, in every theme, and refuses a
theme that fails one:

- Primary and secondary text at 4.5:1 on every surface text sits on: app,
  panel, raised, code, control, the card, a hovered row and a selected row.
- Accent, status and diff colours at 4.5:1 on app, panel, raised and card,
  because each of them is written as words somewhere (a link, a "saved
  locally" label, a status chip, the console's diff stat).
- A solid button's label at 4.5:1 on its fill. Buttons are 12–13px bold,
  which is not WCAG "large text", so the 3:1 large-text floor does not apply.
- Diff ink at 4.5:1 on its own tinted line, and syntax at 4.5:1 on the code
  well and on both kinds of tinted line; the comment, muted on purpose in
  every editor palette, at 3:1.
- The 3:1 non-text floor for the accent glyph on a selected row, the focus
  ring on every surface it can land on, and the heart.
- Secondary text measurably quieter than primary (at least 1.25:1 between
  them), and in dark themes a raised surface lighter than the panel, so a menu
  lifts off the page instead of reading as a hole in it.
- In every theme, every glyph tone at least 10 (OKLab ×100) from
  every other, so no two kinds of thing share a colour (§ Glyph tones).

Selected text (`::selection` in `base.css`) is a 24% tint of the accent fill
written in primary text, the strength at which that text still clears 4.5:1
on every surface of every theme.

**Official themes.** GitOdile Light and Dark are the two records that carry the
ink palette above; they are the default and the pair "match device" resolves
between. They are not a starting point that community themes replace. The
green-accent palette they carried before ADR 0033 is retired: its ids now
carry the ink values, so a stored preference moves with them.

**Community themes.** Only palettes with a canonical, attributable source are
admitted (Catppuccin Mocha, Latte and Frappé; Nord; Tokyo Night; Dracula;
Solarized Dark and Light; Gruvbox Dark and Light). Their published surfaces
and hues are the starting point; the mapping onto GitOdile's extra roles —
diff, syntax, renamed, heart — is ours, and where a published hue cannot pass
the contract above it is lifted (dark) or darkened (light) along its own
lightness until it does, keeping the hue. Each block in `themes.css` names
the values that moved and why. A palette without a canonical source (for
example Vercel/Geist, which is a design system) is not admitted, because a
"theme" for it would be invented colours. A variant too close to one already
shipped is not admitted either: Catppuccin Macchiato sat between Mocha and
Frappé, and the picker showed three cards nobody could tell apart. A stored
Macchiato preference lands on Mocha.

Status colours keep their meaning across themes, but they mark *status*, not
*progress*: a completed journey step, its connector, and a celebratory
all-clear use the theme accent with neutral text, never success green, so the
progress band never fights the palette. Success green stays on chips,
confirmations, diff categories, and genuine status marks.

Theme resolution order (highest priority first):

1. An explicit theme, persisted locally and applied immediately.
2. "System" (the match-device preference), which resolves to the official Light or Dark from
   `prefers-color-scheme` and follows it live through the media query.

The user must always be able to return to "System", so an explicit choice
never silently strands them on a theme that has drifted from their OS setting.
A pinned community theme has no official counterpart, so the titlebar toggle
hands control back to the device — its glyph becomes the monitor, matching
"System"; from the device or an official theme it flips between the
official light and dark. "System" and every named theme stay reachable
from Settings > Interface > Theme and the command palette. The picker shows
each theme as a miniature of the app in its own tokens, with the scheme carried
by a glyph and by the option's accessible name, never by colour alone. Each
option is a bordered card in the project-icon picker's language, with a 16:10
miniature and the name beneath it; the official cards carry an "Official" tag
right after the name — a word, not a mark, because any check-like glyph on all
three cards would read as all three being chosen. The community grid sits under
a visible "More themes" title. Every picker card in Settings (themes, project
icons, languages, date and number formats, code fonts, the navigation appearance) shares
one selected state: a quiet fill, the secondary-ink border and a filled check
in the card's top corner, clear of the specimen being judged.

The Settings rail is grouped into three titled blocks — App, Work, and
Version control — with Updates set apart below a divider; the titles are visual only,
so the arrow keys move straight across them. Line endings is the last group of
the Git section rather than a rail entry, after the Git installation, the
identity, the default branch and hooks.

Do not introduce a color anywhere in the product (status badges, diff
highlighting, charts, mascot variants) without first checking whether it is
expressible through an existing token; new one-off colours fragment the theme
story.

## Brand and mascot

Working brand: **GitOdile**.

Mascot: a stylized crocodile that feels clever, calm, and trustworthy — a
bodyguard for your work, which is the product's promise. It is a flat
silhouette, simple enough to read at 16px (ADR 0031).

Visual traits:

- a seated crocodile with a long, straight snout, a crest of five equal
  rounded lobes, a white belly, short arms and two feet;
- one flat green body `#86b640` with no outline; the belly, the toes and two
  tall pill-shaped eyes are white cut-outs;
- three body-coloured plates cross the belly, all starting on one vertical;
- no mouth line: five pointed teeth hang from the level jaw, and the fingers
  end in the same points;
- every corner on one small radius scale, so the drawing reads as one system;
- not overly detailed or child-oriented: no outline, glasses or extra colours.

The mascot may appear in:

- application icon;
- onboarding;
- empty states;
- success and recovery moments;
- documentation and marketing.

Do not place the mascot in every panel or use it to trivialize serious errors.

**Application mark:** there is one drawing, shown whole or cropped:

| Crop | Where | File |
| --- | --- | --- |
| Body | the application icon at every size and on every platform, welcome screen, About dialog, the app's row in Settings › Updates, the console welcome's ASCII mascot, the installer's side panel, brand material | `src/assets/gitodile-mascot.svg` |
| Head | the installer's header, brand material (`Mascot`'s `head` variant stays for a future in-app mark where only a head fits) | `src/assets/gitodile-mascot-head.svg` |

The head crop runs from the crest to the snout tip and is cut a little under
the teeth, so the neck runs on below the edge.

The application icon is the same everywhere: the whole mascot in ink
`#0e1512`, with a warm white belly, toes and eyes `#fbf8f0`, on a rounded tile
with a soft vertical white gradient, `#ffffff` at the top to `#e8e8e8` at the
bottom (ADR 0031), as the white-tiled tools beside it in the Dock and the
taskbar do; the grey base keeps the tile's edge on a white desktop. It is drawn large, its height centred in the tile and the snout
tip just short of the right edge, so the tail tip runs into the rounded corner
and is cut there; the face stays legible at 32px, and the 16–32px sizes are
the same icon, downsampled. Windows and Linux take the
icon filling the canvas; macOS takes the identical icon on Apple's 824px grid
(`src/assets/brand/gitodile-icon-macos.svg`) and adds its own shadow. The tile
carries no drawn glow, highlight or shadow. The Windows installer wears the
same lime: its side panel (Welcome and Finish pages) shows the whole mascot in
ink clear of every edge, and the header strip of every other page shows its
head. Neither bitmap carries text, because the installer is
localised and its pages already name the product. Inside the app the body's green follows the theme (see the welcome
screen under "Icons" above).

`scripts/icons/mascot.mjs` is the single source for the drawing, built from the
traced shapes in `scripts/icons/mascot-shapes.mjs`: it writes the SVGs, the
element tree the in-app mark renders (`src/shared/ui/mascotArtwork.ts`), the
mascot's ASCII art for the console welcome (`src/features/console/mascotAscii.ts`)
and the icon sources, and `pnpm icons` regenerates every packaged icon and the
brand PNGs under `src/assets/brand/png` (the icon at 16–1024px, the macOS icon,
the mascot and the head) from it (see "Application icon and Windows shortcuts"
in `docs/ARCHITECTURE.md`). Never edit a generated SVG or PNG by hand.

## Typography

Use the system UI font stack for application chrome and prose. Dense source
content may use the bundled Atkinson Hyperlegible Mono Regular with the system
monospace stack as fallback; keep it scoped to code and technical identifiers.

Requirements:

- clear distinction between headings, labels, body copy, and metadata;
- monospaced text for paths, refs, hashes, commands, and diffs;
- restrained semantic syntax tokens may clarify code, but diff backgrounds and
  signs remain the primary added/removed signal;
- readable line heights;
- no tiny low-contrast secondary text;
- avoid all-caps labels except very short status tags.

### Size

**Type size is a token, the same way a control's height is.** Pick the step by
what the text *is*, never by how big it needs to look on the surface in front of
you — that is what let one screen drift a whole step below the rest while every
value in it looked locally reasonable.

| Token | What it is |
| --- | --- |
| `--text-hero` (28px) | A name, not a heading: the app's, the project's. One per surface |
| `--text-display` (22px) | The screen's own title (`h1`), and a figure meant to be read at a glance |
| `--text-title` (17px) | A card, dialog or section heading (`h2`) |
| `--text-subtitle` (15px) | A heading inside a card (`h3`) |
| `--text-lead` (14px) | The name of a row, where the row *is* the content |
| `--text-body` (13px) | Body copy, and any labelled control (`--control-font-md`) |
| `--text-label` (12px) | A label, and a control living inside a row (`--control-font-sm`) |
| `--text-caption` (11px) | A chip, a count, metadata beside a name |
| `--text-micro` (10px) | The floor: an avatar's initials, a badge's number |

**Whole pixels, and these particular ones.** The steps are not house taste; they
are where desktop software has converged, and they were checked against it:

| | Body | Secondary | Floor | Section heading | Screen title |
| --- | --- | --- | --- | --- | --- |
| [macOS HIG](https://developer.apple.com/design/human-interface-guidelines/typography) | 13 | 12 / 11 | 10 | 15 / 17 | 22 |
| [Windows 11 / Fluent 2](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/typography) | 14 | 12 | 12 | 20 | 28 |
| VS Code | 13 | 12 | 11 | — | — |
| [GitHub Desktop](https://github.com/desktop/desktop) | 12 | 11 | 9 | 14 | 28 |
| [GitButler](https://github.com/gitbutlerapp/gitbutler) | 12 | 11 | 10 | 13–15 | — |
| **GitOdile** | **13** | **12 / 11** | **10** | **15 / 17** | **22** |

22/17/15 is the macOS title ramp and 13/12/11/10 its body ramp, which is also
where VS Code, GitHub Desktop and GitButler land. Fluent's 14px body and 12px
floor belong to a general-audience, touch-capable ramp; every dense developer
tool in the table sits below it, and so do we.

The scale used to run half a pixel above all of them — 13.5, 12.5, 11.5, 10.5 —
because five steps had been squeezed into the four the ramp has. No established
ramp uses a fractional size, and a fractional one also sits worse on the pixel
grid at small sizes. `styleComposition.test.ts` fails the build on a non-integer
step.

**`--text-*` is a size, always.** The two text *colors* carry a `-color`
suffix — `--text-primary-color` and `--text-secondary-color` — because they
predate this scale and would otherwise read as steps of it. So `var(--text-label)`
is a size and `var(--text-secondary-color)` is a color, and you can tell which
without looking either one up. Every step here is named for what the text *is*
(`body`, `label`, `caption`), never for its prominence.

`--text-micro` is a floor, not a step to reach for. Below it the app was running
8.5px and 9px secondary text, which the Accessibility section already forbids.

Two things sit below the floor, and both are named in the guard rather than
left to judgement. `.navigation-display__preview small` is a label inside a miniature *drawing* of
the navigation rail, where the text is part of the picture rather than something
anyone reads; and `.console-art` is the console welcome's ASCII mascot, whose
characters are the picture's shading at 7px in the welcome and up to 5px in
the watermark (or a narrow welcome), not words. None is prose. Adding
another is a deliberate edit to the guard, not a quiet override.

### Weight

**Five steps, and each of them is a role.** Anything in between is a number
somebody eyeballed.

| Token | What it is |
| --- | --- |
| `--weight-normal` (400) | Body copy and metadata |
| `--weight-medium` (500) | A value that must not be mistaken for a name |
| `--weight-strong` (600) | The name of a thing: a file, a branch, a row's subject |
| `--weight-heading` (650) | A heading, and the label of a selected control |
| `--weight-title` (700) | A screen or dialog title, a primary action, an avatar's initials |

Two things this settles:

- **Semibold, not bold, carries emphasis.** Fluent states it outright: bold is
  not part of the Windows type ramp, and Semibold is what emphasis uses. That is
  what `--weight-strong` is.
- **`<strong>` is a semantic mark, not a request for a weight.** Left to the
  browser it lands on 700 — the loudest step the app owns. History reached for
  it on every filename, count, value and area total, so the densest screen in
  the app was also its boldest, and no single rule looked wrong. `base.css`
  pins `strong`/`b` to `--weight-strong`; a surface that genuinely needs more
  says so itself.
- **A heading is never heavier than the screen title.** `h2` and `h3` carry
  `--weight-heading` from `base.css` rather than the browser's bold, and their
  sizes come from the scale, so an un-styled heading is never a 24px guess.

The drift this replaced: History ran 630, 680 and 760 while every other screen
sat on 600/650/700 — including the *same* commit row, which Overview renders at
650 and History rendered at 680.

### Leading and tracking

The same idea on the last two axes. Every ramp in the table above pairs a line
height with each *size*; ours pairs one with each *role*, which survives a size
change — the size pass moved every number in the app and not one line height had
to follow.

| Token | What it is |
| --- | --- |
| `--leading-none` (1) | A glyph centred in a box of its own: a count, an avatar's initials |
| `--leading-tight` (1.2) | A heading — the bigger the type, the less air it needs |
| `--leading-snug` (1.35) | A name, or a row that may wrap to a second line |
| `--leading-normal` (1.5) | Body copy and prose |
| `--leading-code` (1.6) | A monospace *surface*: a diff, a code block, an editable file |

| Token | What it is |
| --- | --- |
| `--tracking-hero` (-0.02em) | The largest type on a surface |
| `--tracking-tight` (-0.01em) | A heading |
| `--tracking-wide` (0.02em) | Small text opened out: initials, a count |
| `--tracking-caps` (0.06em) | An uppercase label |

Wrapping is set once, in `styles/base.css`: the body takes
`text-wrap-style: pretty`, so a sentence that needs two lines never leaves one
word alone on the second, and headings take `balance`, so two lines split
evenly. Both are the longhand, which leaves `text-wrap-mode` alone, so a
surface's own `nowrap` still wins. A setting's description takes all the width
its control leaves (a switch leaves most of the row; there is no `ch` measure
on it) and is one plain paragraph that wraps where the width runs out, like
every other text in the app. Never split copy into one line per sentence or
per clause, with inline blocks, `<br>` or a component: the lines come out
uneven and the text reads as a list rather than a sentence. When a hint wraps
badly, shorten it. Descriptions are written to fit one line.
None of this is a reason to write long copy: the first fix for a wrapped hint
is a shorter hint (see Content design).

### Family and figures

`--font-sans` and `--font-mono` name the two stacks. Before them the monospace
stack was spelled out verbatim twelve times, so adding a fallback meant finding
all twelve. TypeScript had already understood this — `SYSTEM_MONO_STACK` in
`features/changes/diffPreferences.tsx` builds the diff's font preference and has
to spell the stack out — so a guard compares that constant against the token and
fails if they drift.

**A figure read against a sibling takes tabular figures.** A column of counts, a
row of stats, a badge whose number updates in place: without
`font-variant-numeric: tabular-nums` the digits are proportional, so the value
shifts sideways as it changes and a column of them never lines up. Changes
already did this for its diff totals; History rendered the same two numbers
without it, alongside four other figures that wanted it.

Two distinctions worth keeping:

- **A code surface is not the same as monospace text.** A diff, a code block and
  the ignore-file editor take `--leading-code`; a branch name or a file path
  that merely happens to be monospace is a *name*, and takes `--leading-snug`
  like any other. Deciding this by font family rather than by role is how the
  same list ended up at 1.35, 1.4 and 1.45 in one sheet.
- **`letter-spacing: 0` is a reset, not a step.** The tooltip uses it to shed
  whatever tracking it was rendered inside of, and the guard allows it.

The drift this replaced: twelve line heights for what were only ever four roles
plus code, and eleven tracking values — among them −0.005, −0.012 and −0.018em,
which at the sizes they were written on differ by about a fifth of a pixel.

`styleComposition.test.ts` fails the build on any literal `font-weight` or
`font-size` anywhere in the eager cascade — inside the `font:` shorthand too,
which is where six rules had been hiding from both guards — on a fractional step
in the tokens, on `--control-font-*` drifting from the text step it must match,
on any literal `line-height` or `letter-spacing`, on a font stack spelled out
in a feature sheet, on the TypeScript mono stack drifting from `--font-mono`,
and on a `<strong>` left to the browser's bold. Every sheet is on the scale: the
pass that got them there moved 248 declarations spread across twenty-two
distinct values — 14.5, 16, 18, 20 and 21 among them, each reasonable where it
was written and none of them agreeing with the next sheet over.

## Motion

Motion should communicate relationships and state changes, not decorate.

Good uses:

- panel transitions;
- file selection;
- expanding technical details;
- successful save/publish feedback;
- progress between safe-operation steps.

Rules:

- keep most transitions between 120–220ms, and write them as `--duration-fast`
  or `--duration-normal`; something arriving — a menu, the palette, a flyout,
  the search field opening into it — eases in on `--ease-emphasized` and
  leaves in `--duration-exit` on an `ease-in`. Three curves are not arrivals
  and keep their own: a rail glyph's hover turn eases in and out so a 60° turn
  reads as a turn, the theme cross-fade, and the mascot's hop. Looping and
  character animation (the mascot, spinners, the attention halo) is
  choreography and keeps its own timings;
- screen navigation shows already-available content immediately. Home's recent
  projects and Overview's saved versions have no row entrance cascade; rail
  selection changes colour and background without scaling the selected icon.
  Keep motion for actual arrivals, action feedback and changes within a view;
- Overview's compact restoration card fades in at `--duration-normal` (180ms);
- a theme change cross-fades the whole window at `--duration-normal`, from
  every control that offers one — the titlebar toggle, Settings and the command
  palette. The point is that the whole surface changes together, rather than the
  background fading while the panels on top of it snap. The titlebar toggle once
  had its own circular reveal anchored on the button, on the theory that a change
  caused by one control should look like it came from there; it was withdrawn,
  because a curve that paces a position does not pace a radius, and "system" —
  which Settings offers — has no origin to sweep from anyway;
- a language change takes the same window cross-fade, so every label changes
  together instead of the new words snapping in over one frame. The fade starts
  once the incoming dictionary is loaded, never covers the load, and is skipped
  when "System" resolves to the language already shown. Settings offers each
  language as a picker card: a round mark with its code (the monitor for
  "System"), its own name, and a line of the product's words in that language;
  "System" shows the language it resolves to. No flags: a flag names a
  country, not a language, and Windows draws flag emoji as two letters;
- avoid large spring animations in work surfaces;
- respect `prefers-reduced-motion`;
- Appearance settings offers an app-specific **Reduce motion** switch, off by
  default. When enabled it removes GitOdile's transitions and animations while
  keeping every state change immediately visible; the operating-system
  preference is respected independently and never needs this switch to be on;
- never delay an operation solely to show an animation;
- Git and GitHub CLI installation cards use an icon-only recheck with a
  localized tooltip and accessible name. A manual check spins the icon for
  at least one 500ms turn, or while the probe remains active; results appear
  immediately in the card. Reduced motion removes the spin and cosmetic delay.
  Starting a new local or update check clears previous installation/guidance
  receipts so they cannot hide its progress or result, including late responses
  from earlier actions. While local diagnostics run, the primary action waits
  for their result. An update answer belongs to the installed version that was
  checked and is discarded when that version changes or cannot be established.
- **one animation asks for attention, everywhere it is asked for:**
  `.attention-breathe` (primitives.css, tuned by `--attention-duration`,
  `--attention-spread` and `--attention-color` in tokens.css). A halo leaves
  the element and fades to nothing by its full reach — it is only ever seen
  going out, never coming back in — and it fires a single time, when the state
  arrives, rather than looping: a wave that never ends stops meaning "something
  happened" and starts meaning "ignore me", which is what a persistent "next
  step" would become. Nothing inside the element moves and no layout shifts, so
  the same class fits a 40px tile and an 18px badge. It was chosen over a scale
  pulse (moves the text around it), sonar rings and a heartbeat (insistent), a
  glow (neon in dark mode) and a sheen or orbit (need room the small cases do
  not have). Overview's active step wears it today; a badge for something new
  or an update that is ready would wear the same one. A surface re-points its
  colour, never its shape.
  **The notification dot is the same halo repeated a closed set of times.**
  `notification-dot-breathe` fires three breaths rather than the one the rest
  use, because the titlebar is chrome the reader sees all day and a single wave
  there is easily missed. It is a second keyframe only because it must carry the
  dot's surface ring in the same `box-shadow`; it is not a second idea, and it
  follows the same rule — started in the component only when reduced motion is
  off.
- **The mascot moves differently in each brand moment**
  (`Mascot`'s `motion` and `entrance`, primitives.css). About uses `wink`:
  every 6.5s the front eye closes and opens again, in step with the band of
  light that crosses the wordmark's "Odile" — the eye is shut while the light
  is halfway across — a friendly gesture for a card someone reads, over in
  under a second. The no-project welcome plays `entrance` once per session:
  the mascot draws itself. Every edge (the silhouette, belly, toes and eyes)
  traces in 0.7s in the text colour, then the colours fade in while the trace
  fades out, since the drawing has no outline of its own, about 1.1s in all.
  After it, and on every later visit, Home uses `blink`: both eyes blink,
  quicker than the wink, at an uneven pace over a 17s cycle — about every 5s,
  once as a double blink — so the mascot reads as someone waiting rather than
  a metronome. Each gesture is a fraction of a second followed by seconds of
  stillness, so neither place moves constantly. The console welcome is the third brand moment:
  behind its ASCII mascot, short columns of hex digits, like commit hashes,
  (the project's own short version ids) fall through the art's box at 3–7s
  each (a terminal's digital rain), dim,
  in the body's colour, fading toward their top and passing behind the
  silhouette, belly included. The rain dissolves at the top and sides and
  stops on the mascot's foot row, sharing its imaginary ground. Behind the
  compact watermark it falls through the mascot's whole column, from the top
  of the pane. The welcome's blink, the drawing's move to and from the
  watermark and the watermark's blink on each command are described in
  Console above. Motion
  is CSS only and stops with the console when the screen
  is hidden. These are the only decorative animations GitOdile allows, and
  only in these three places; the rest of the workbench never decorates. The
  system and app reduced-motion settings remove them; the mascot then shows
  still.
- **The mascot in Settings › Updates carries the update's work, not a brand
  moment.** The app's own row shows the whole mascot standing free in the
  row's 32px column — no circle behind it and nothing clipping it, so the hop
  rises past the tile — still while the state is settled. While the update is checked, verified or
  installed it hops: a small jump twice a second that lands with a squash from
  the feet (`hop`), so it reads as someone waiting, beside the button's own
  spinner. While a download of known size runs, the body fills from the feet
  up over a faint silhouette of itself (`progress`), easing between reports; a
  download of unknown size hops instead. Both stop the moment the state
  settles. Reduced motion removes the hop; the fill stays, because it is the
  progress itself, and only loses its easing.
- **A check the user presses stays visibly "checking" for at least 800ms**
  (`MANUAL_CHECK_MINIMUM_MS`, the update controller). A build that cannot
  check answers in a few milliseconds, and a verdict that replaces the press
  at once reads as a failure rather than a check — the same reason the tool
  rows' recheck spins for one turn. Only the verdict waits: native has
  already finished the work, and "checking" shows from the press itself,
  before native answers. Background checks are never held, nobody is
  watching them, and reduced motion skips the hold. The held "checking" has
  no operation yet, so the dialog offers no Cancel until native names one.
- **A development build is calm, not a warning.** A build without an update
  key (`not_configured`: development and local builds) cannot check by
  design, and native knows it at startup, so the app starts in that state
  rather than "Not checked yet". Its row says "Development build" in a
  neutral chip, one neutral line says development builds don't update
  themselves, and "Check for updates" stays in its place, disabled: a build
  cannot gain a key while it runs, so there is nothing to check again, and
  the controller refuses the check from every other entry point too. Every
  other "not available" — no package for this system, no feed yet — keeps
  the warning tone, because there the reader has something to do.

## Transparency and native effects

CSS translucency (`backdrop-filter` blur) is not used for standing chrome — the sidebar, top bar, and cards are opaque; see "Visual character" above. It may still appear briefly behind a modal/command-palette scrim, since that's a transient overlay rather than a panel the user stares at all session.

Native window effects such as Windows Mica/Acrylic and macOS vibrancy are optional enhancements and, if adopted later, are a visual bonus layered under still-opaque content — not a substitute for the shadow-based depth system. The app must look complete without them because behavior varies by OS, compositor, and webview. Linux should receive a deliberate solid-surface fallback.

## Accessibility

Minimum expectations:

- full keyboard navigation for primary workflows;
- visible focus states;
- WCAG AA text contrast where practical;
- do not communicate file state only through color;
- scalable text and layouts;
- screen-reader labels for icon-only controls;
- reduced-motion support;
- minimum comfortable pointer target sizes.

In a short viewport (including native WebView zoom), Overlapping changes
keeps its existing list/detail panes and lets the sheet scroll past the
compact navigation and wrapped header. The list and the two-side reading
area retain a minimum of four `--strip-height` units, so virtualization
still has a viewport and keyboard focus can reveal every file action.

**Focus is one colour in the field's own shape.** A button, a checkbox or a
row takes a 2px `--focus-ring` outline. A field that hides the outline shows
focus with the same colour on the edge it already has: a capsule or a framed
field turns its border `--focus-ring`, an underlined field (Home's launcher,
the Console's prompts, a branch being renamed) turns its line. A scroller that
takes focus inside a clipping frame (the issue report) rings the frame. A
container that only receives focus moved by script — a dialog, its title —
draws nothing. `styleComposition.test.ts` fails a removed outline that names no
replacement.

Keyboard shortcuts must use platform conventions:

- `Ctrl` on Windows/Linux;
- `Cmd` on macOS.

The shortcut sheet follows them. It lists the app-level shortcuts and groups
them, and it draws each key in the platform's own form — `Ctrl`, `Shift` and
`Esc` spelled out on Windows and Linux, `⌘`, `⇧` and `esc` on macOS — under a
header tile that wears the platform's mark, so what it shows is the keyboard the
reader actually has. Pointing at a row taps its keys in the order they are
pressed instead of selecting the label, and the motion is withdrawn under
reduced-motion.

### Pointer cursors

Follow desktop rather than browser cursor conventions. Standard controls —
buttons, menus, selectable rows, checkboxes, navigation, and dropdowns — keep
the system arrow and communicate interactivity through shape, hover, pressed,
selected, and focus states. Disabled controls also keep the arrow; reduced
opacity and the disabled interaction state carry that meaning.

Reserve the pointing hand for real links and text actions deliberately styled
as links, where the cursor helps compensate for their lighter affordance — the
Save version detail disclosure, About's update link, About's licence and
source links, About's copy control, About's stack credits (each leaves the app
for another site), a dialog's inline way out (`.app-dialog__link`) and a
toast's action. Use
special-purpose cursors only when they describe the operation itself, such as
text selection, resizing, dragging, progress, or a forbidden drop target. A
guarded list in the style-composition audit names every control allowed to take
the hand, so this stays a decision rather than a habit.

## Dialogs

Every dialog that asks or tells — create, clone, save, publish, get project
changes, discard and restore, the branch dialogs, updates, the app's
messages and the issue report — wears one shell: `Dialog` in `shared/ui`
(`.app-dialog`). About, What's new and the shortcut sheet are documents to
read rather than questions to answer and keep their identity shell. The shell
exists because the dialogs had drifted to seven widths, four paddings, borders
on some and not others, and three different headers; a new dialog takes the
shell and a size, never a width of its own.

The shell is a named `dialog` or `alertdialog` with its own heading. Its
header is a neutral container, so an overlay outside `main` does not add a
second application-wide banner to screen-reader landmark navigation.

The documents still read as the same family: What's new and the shortcut
sheet share the `s` width, the 28px inset and the header below (a 40px glyph
circle and a `--text-title` heading); only About keeps its identity hero.
**Settings is the one dialog outside the three sizes** — a preferences
workspace up to 1000 × 680px, not a question — and it opens the same way:
the glyph and the title in its header. Its header and its category rail are
regions of one surface and meet the content on the `--border-subtle`
hairline, the rail's icons on the header's 24px inset. Every modal sits on one
backdrop (`.app-dialog-backdrop`); a dialog opened over another one, such as
Console's confirmation inside Settings, keeps its own backdrop clear so the
window is not veiled twice.

**Three sizes, by what the dialog holds.**

| Size | Width | For |
|---|---|---|
| `s` | 440px | A message, an error, a confirmation, a result with a next step: discard, delete a branch, switch branches, a new branch, close a project, anything that failed |
| `m` | 560px | A short form or a plan: save a version, publish, get project changes, updates, connecting a remote |
| `l` | 720px | A flow with a review or lists: create a project, clone, the issue report |

A flow may change size between steps — its failure or its result is a short
message in `s` — but a dialog never picks a width outside the three. All three
take 28px of padding, a 1px `--border-subtle` border, `--radius-surface`,
`--shadow-lg` and one `--space-4` gap between parts.

**One header.** The glyph, the title (`--text-title`, one line), the close
button always, and nothing else unless the dialog needs it:

- **Every dialog leads with its glyph**, in a neutral circle, in the tone of
  what it handles (§ Glyph tones): Save version, Publish, Restore and Create
  project in `local`; Get project changes, Clone and Connect a remote in
  `remote`; the update restart dialog and the issue report in `app`; a confirmation
  that removes work (discard, delete a branch) and an error in `danger`; a
  block in `warning`; a result in `success`; a plain question (close a
  project, a new branch, switch branches) or a cancellation in `neutral`. A rule
  with exceptions had left Get with a glyph and Publish without one, and the
  two confirmations that delete work as the only ones that did not warn.
  `Dialog` requires `icon` and `tone`, so a new dialog cannot leave it out.
  The glyph sits **beside** the title, centred on the same axis as the title
  and the close button, never above it: a glyph on its own row pushed a
  two-line title into the space the close button left.
- The title is `--text-title`, the size of every card and section heading in
  the app. At `--text-display` the dialog's title was the loudest line on
  screen once Overview's headings had calmed down.
- The subtitle belongs to the step it describes. A flow's first step says what
  the flow is ("Download a copy to this computer and open it"); later steps
  replace the title and drop the subtitle ("Save the copy", "Creating the
  project…"). A title and subtitle that never change stacked four levels of
  text above every review. A subtitle may also carry the one name the title
  leaves out ("You'll move to “feature/x”.").
- The close button goes away only while work that cannot be interrupted runs,
  and the backdrop and Escape follow it. Initial focus never lands on it.

**Titles fit one line.** In `s`, with the glyph beside it, that is about 30
characters; the fix for a long title is a shorter title, not a smaller type
size or a stacked header. The detail moves to the body: "Can't delete it yet"
over "“feature/x” has versions that aren't anywhere else", not the name inside
the title. No title carries a branch's or a project's name — "Delete this
branch?", "Switch branch", "Publish a new branch", "Project created" — since a long
name is exactly what breaks the line; the name goes to the subtitle or the
body.

**The body is secondary ink at the body size** (`.app-dialog__text`), and the
title is the one strong line. What the dialog will do is said as a short list
of facts (`DialogFacts`) — two or three lines with a glyph each, the line that
says what stays safe last, in the success tone. It is never a grid of titled
cards: four cards of equal weight made "nothing is deleted" read like "sign-in"
and the dialog like a feature page. Mechanism — temporary folders, refs,
tokens, `.git/config`, a HEAD — goes behind a `Technical details` disclosure,
if anywhere. Disclosure headings in dialogs are controls: the default arrow cursor,
non-selectable label and primary text on hover. Their expanded content stays
selectable, and native keyboard toggling and visible focus are preserved.
Consequences are facts too, never a bulleted list of their own,
and so is a note that says what stays safe ("A copy is kept, so you can undo
it"): it is the safe fact, last.

**Popovers and menus share one surface**, the floating half of Friendly Sheet:
`--surface-raised`, the subtle border, `--radius-surface`, `--shadow-lg` and
`--layer-popover` (`--layer-nested-popover` when opened from inside another).
A menu (`.app-menu`, the context menu, the switchers) insets its rows by
`--space-2`, which keeps the 10px rows concentric with the 18px surface; a
popover that holds content rather than rows (the account panel, a filter
panel) takes `--space-3` to `--space-5` like a card. Its title, when it has
one, is `--text-body` at `--weight-strong` — it is named by the control that
opened it — and its empty state is `.empty-state--compact` or
`.empty-line--menu`. A new popover starts from `.app-menu` or the filter
panel, never from a blank rule.

**One recipe for a card inside a dialog**, the regions-and-cards rule of
Friendly Sheet applied to what floats: `--surface-card`, the subtle border,
`--radius-surface` and no shadow — the picked repository, the update on
offer, the files a save carries, the versions a publish sends, a choice with
its own explanation. Options and rows inside it keep `--radius-item`;
monospace text (the issue report, technical details) sits on
`--surface-code`; `--surface-control` is only for controls. The review found
six recipes for the same role, two of them on the dialog's own surface and so
invisible in the light theme. What's new's current release keeps its one
tinted panel on purpose. A selected option wears one recipe everywhere: the
secondary ink's edge and `--tint-selected` of the ink (`choice-list__option--active`).

**Conditions and failures are banners** (`DialogBanner`, `--radius-surface`
like an in-screen notice): `danger` for a failure, `warning` for something to
fix first, `info` for a fact, each with its way out inside it as a text action
("Add in Settings", "Save without hooks just this once"). A text action is an
`.app-dialog__link`, underlined at rest: under the ink accent its colour no
longer sets it apart from the words around it.

**Actions sit on the right, dismiss first and the title's verb last.** Every
form, confirmation and plan has `Cancel` beside its primary action, including
destructive ones — a confirmation whose only visible button is the destructive
one reads as "press this to continue". The primary repeats the verb of the
title ("Save version", "Create branch", "Delete branch", "Publish changes"), and
carries an icon only when it is one of the vocabulary's verbs: save, publish,
get (cloning is a get), discard, delete, and restore, the undo of a discard.
Create, switch, review, check, download and copy carry none. A dismiss that
returns to the step before says "Back", not "Cancel". **Anything that removes work is `danger-button`** — the
solid primary is for the constructive choice, and a delete in it said the
opposite. A note that belongs to the action ("Only on this computer until you
publish") takes the left of the same row. A choice made for this action alone
is an `app-checkbox`; a switch is for a setting that persists. Placeholders are
set in the sans even where the value is set in the mono.

**A result with no next step is a toast, not a dialog.** A published change, a
branch switched, created or deleted, a discard (whose toast carries `Undo`),
a restore, a remote connected: the dialog closes and `useToast` says what
happened, under the window, for a few seconds (paused while pointed at or
focused). Up to three stack above the status bar, newest nearest it; each
carries a dismiss control and, when it has a clock, a bar that drains with the
same wait so the reader can see how long is left. A toast that offers an action
(`See what's new`) has no clock — it waits for the reader rather than vanishing
mid-reach. A result stays a dialog only when it offers something — a saved
version offers Publish, a created project offers connecting a remote.

**A dead end offers the way out, not a retry.** "Nothing to save" and
"Everything is already published" offer `Close`: retrying cannot change them.
A block that only the reader can lift offers the action that lifts it
("Save your changes" → `Save version`). `Try again` is for failures that a
retry may actually pass.

**Being up to date is an answer, not a stop.** Get project changes on a
project with nothing newer closes on a toast ("Everything is up to date"),
never on a warning to dismiss. Its loading shell waits 150 ms before it
appears, so a local answer ends on the toast with no dialog flashing first;
while an old remote check is being redone, the dialog keeps loading rather
than saying "nothing" and then turning into a plan. When the remote could not
be asked, it says so ("Couldn't check project changes", the reason, what this
computer still knows) and offers `Try again` — silence is never read as "up to
date". A screen whose last answer was "nothing is waiting" offers to check the
remote, not to get: Changes' settled and unpublished states show "Check for
project changes", the same read-only check as Overview and the status bar.

**A plan that is still being read opens in its final shape.** The dialog
appears at once with its title, `Cancel` and its primary action — held back
until the plan is in — and faint text placeholders (`.text-placeholder`) where
the plan's sentences and rows will be (see "A first load draws the shape" under § Core screens); a fact that holds for every
plan, such as who will see a publish, is shown for real. A separate
"Checking…" dialog that another dialog later replaced read as two events for
one click, and moved every control once it landed. **What the project already
knows may stand in for the placeholders.**
Publish opens on the session's cached pending list — the remote as of the last
check — with its primary held back as "Checking the remote…" until the fresh
plan arrives and decides: a different count replaces the preview's, and a
block replaces the whole plan. Without a tracked branch there is nothing
trustworthy to preview, and the placeholders stay.

**Progress is three steps at most.** The native side may report six phases;
the dialog maps them onto the few the reader can follow ("Downloading",
"Checking", "Opening") in `.app-dialog__steps`, the active one spinning and the
done ones ticked. A step that is the reader's to do outside GitOdile
carries the glyph of the action, in primary ink, not spinning and never a
number: nothing runs until they act. Each step is one short line. The issue report's "Finish on GitHub" is
the case: after the browser opens it ticks the copy and the launch, shows the
paste glyph on the paste, and offers `Copy again` and `Done`; a
copy that failed is crossed in the warning ink and adds `Save report…`.

**Copy follows § Content design**, with one addition for dialogs: the text a
dialog shows is written in `translations.ts` from facts the native side
returns. A sentence built in Rust arrives in English whatever the reader's
language, so the native side sends codes and data, and the updater only shows
its English safe detail to an English reader. A blocked install names the
unfinished edit with the label its owning feature writes in the reader's
language — the title of the dialog or section that holds it — and a block
with no such name gets a sentence that points at nothing missing.

## Account and sign-in

**GitHub integration is a separate connection.** Settings has one **Integrations**
section for every provider, in two groups: **Connected accounts**, and **By
provider**, a folded block per provider (glyph, name, and a one-line summary —
accounts, company servers, whether its CLI is installed) whose body holds what
only that provider has: the company-server inventory and the CLI tooling. A
block's body stays mounted once opened, so folding it never drops a draft.
A provider CLI that does not answer, or that has a known update, puts a chip on
its folded block ("GitHub tool: needs attention", warning; "…: update
available", accent), a matching badge on the Accounts rail entry, and opens
that block on arrival — or when the answer arrives later — unless the reader
has already opened or folded it; a block never folds by itself. A CLI that is
simply not installed asks for nothing there: it is optional. Where it is
needed — the browser method of the connect panel — the panel says so and shows
the CLI's own installation row in place, so installing, the official guide and
the recheck happen without leaving the panel.
Connected accounts is one list for every host of every provider; a host with
nothing connected or in progress is left out rather than drawn empty, and the
list says once when nothing is connected at all. Each host is a
small label (glyph, host, a "Company" pill for servers) over a bordered list of
account rows, each one line: a 32px avatar (the account's own picture from its
provider, or the person glyph) with the provider's mark on a small raised badge
at its lower trailing corner, the login, a method chip (Token or
Browser) and a state chip, with short text verbs on the right (Use · Remove ·
Sign out); a second line appears only for a problem or a storage caveat. The
installation rows for Git, the CLIs and the app update share that geometry in
their own card: tile, name, installed-version chip and state chip on one line,
the official guide as an icon button beside the check and the primary action.
The group header owns the only account check, which covers every provider, and
**Connect account**, a menu that names each provider with how it connects
(GitHub and GitLab: browser or token; Bitbucket: API token). Choosing one opens
one inline panel titled with the provider: a Token/Browser segmented choice, the
host when there is more than one, then the masked token field or the browser
consent; Bitbucket's panel is the token field alone. Home's **+** for another
account lands on Accounts with this menu open and its first provider focused. Consequences are stated in that panel, not as permanent notes under
every group. **One accent-filled action per page**: Connect account while nothing is
connected and the panel's submit; tooling checks and server additions stay
secondary. Cancellation restores the initiating control's focus.

Known rejected tokens say **Token rejected**, with provider-specific guidance,
rather than reusing a Git remote-access error. A known invalid browser
authorization says **Needs attention** even when its cached receipt also needs
checking. One main explanation belongs to the row; technical GitLab CLI repair
guidance is disclosed on demand, with an explicit connection check. No copy
infers expiry or revocation from a network failure.

Development builds additionally expose **Account**, separate from the
project connections, with an always-visible Demo label. It shows the mock
identity and plan, next-attempt scenario, sign-out and Reset demo. Reset clears
the simulated session and restores the Free outcome. It is memory-only and
sends nothing. Starting the existing account flow suspends Settings' focus trap
and makes that workspace inert until the flow closes; the initiating button
receives focus again. The account dialog adds no second backdrop veil. This
category and its palette entry are absent from production builds.

Browser account detection contacts GitHub after launch (ADR 0027) or on
Check connections; opening the section renders cached state only. List saved accounts with the
active account first. Reuse the installation row: a small circular cached avatar,
username and status chip on the left, actions aligned to the far right, and the
host beneath the identity. Use a neutral person glyph if the image fails;
retain a known identity on network failure without labeling it connected, and
offer explicit checks. Label the active verified account Connected and inactive
verified accounts Saved. Use account selects a saved account without another
browser login; each row offers targeted sign-out, and Connect another account
appears below the list. Explain that selecting or removing an account changes
the shared gh session. Browser connection first explains the shared gh session,
repository permissions and possible plaintext fallback. Its inline waiting panel
has a selectable device code, Copy, Open GitHub and Cancel, with keyboard focus
on Continue when consent opens. Cancellation does not promise unchanged
authorization: gh may already have persisted it.

**Azure Repos connects per organization.** The provider menu offers a personal
access token. Its inline panel collects the organization name/address first,
then uses the shared masked token editor with expiry, Code permissions and
secure-storage guidance. Connected rows and project selectors name
`dev.azure.com/organization`, so two organizations sharing a host stay distinct.
Clone always offers an Azure Repos tab with its provider mark, HTTPS address
field and connection picker. Home shows connected Azure accounts and opens that
tab with the chosen connection. Users paste a clone URL; browser login and
repository discovery are outside this version. See
[ADR 0036](docs/adr/0036-connect-azure-repos-by-organization-and-pat.md).

**Company servers are an inventory.** The group after Accounts lists each
GitHub Enterprise Server or GitLab Self-Managed host with its account count and
Remove; its accounts live in the Accounts list under that host, so the page
does not grow by whole groups per server. Add a server opens a flat address
field whose notes say the address is contacted once, without credentials, and
how certificates and proxies are trusted. Removal confirms inline what is
deleted (its tokens) and what is kept (gh/glab sessions). Clone discovery keeps
one tab per product; its connection menu groups accounts under host headers,
the public host first, and ends with the account check (no separate button
beside the selector). The connection used last is preselected and its projects
load at once; after a cancelled or failed read the list offers a visible
**Find projects** button.

Project settings → Remote lists the remotes first, then **HTTPS access**: one
compact row per host the remotes use (glyph, host, selector), the explanation
once in the group header and one account check for the group. A remote whose
stored address carries sign-in details warns beside that remote; its host row
only points to it. Cloning a registered provider's HTTPS URL and the project's
remote settings share an accessible account selector. Default to existing Git credentials and
require an explicit choice to bind a saved account. Show the chosen identity in
the clone preview and preserve an unavailable selection visibly rather than
switching to another account. Explain that project access does not switch gh's
active account, alter commit authorship or configure SSH. Detect/check buttons
are explicit network actions; opening the selector reads cached state only.

Sign out opens an inline confirmation naming the exact account and explaining
that other gh consumers lose that local credential, while browser sessions and
GitHub authorization remain active. Another saved account may be activated by gh.
Initially focus Not now; dismissal returns focus to its row's Sign out. Escape
dismisses an inline confirmation before closing Settings. Restore actionable
focus after account changes. Disable mutation
for environment-controlled credentials. After removal, show the actual next
account or offer Connect GitHub. Never use this button as an OAuth-revocation action.
See
[ADR 0021](docs/adr/0021-reuse-github-cli-authentication.md).

A GitOdile account is optional and only unlocks Pro or connected services
([`BUSINESS_MODEL.md`](docs/BUSINESS_MODEL.md)); the mechanism is
[ADR 0016](docs/adr/0016-sign-in-through-the-system-browser.md). The design
consequence is one rule: **the app never shows a credential field.** Email,
code and provider sign-in all happen on GitOdile's web page in the system
browser, so every surface below either explains, waits, or confirms.

The flow has four steps, and a new entry point (a Pro feature, Settings) joins
it at step 2 rather than inventing its own:

1. **Account popover.** The rail's account control opens a popover anchored to
   it (`--radius-surface`, `--shadow-lg`), never a modal: signing in is
   optional, so asking about it must not interrupt anything. It carries a
   title, one line saying local work is unaffected without an account, at most
   three concrete things the account adds, and one accent-filled "Sign in"
   button. The line under the button says the sign-in continues in the
   browser; that sentence replaces a separate "Open browser" screen, because
   the consequence is stated before the click.
2. **Waiting dialog.** The click opens the browser immediately and the app
   shows a size `s` dialog: "Waiting for the browser…", the request code in
   `--font-mono` on `--surface-code` (the web page shows the same code, so the
   user can match the tab to the request), and three steps — browser opened,
   sign in, back in GitOdile — with the current one marked by the ring and a
   spinner that stops under reduced motion. Actions: "Cancel" (quiet) and
   "Open again" (secondary), for a browser that opened behind the window or in
   another profile. Nothing in the dialog is accent-filled; the only thing to
   do happens elsewhere.
3. **Web sign-in page.** Outside the app, but it uses the same tokens, shapes
   and mark so the hand-off does not feel like a different product. One card:
   the request row (platform and code), "Continue with GitHub" and "Continue
   with Google" as secondary pills, then email with "Send me a code" as the one
   filled button, because it is the only method that asks for typing. There is
   no separate sign-up — a first sign-in creates the account, and the card says
   so. The code step uses six single-digit boxes (`--radius-item`), a resend
   countdown and "Change email". The finish page says the user can return to
   GitOdile and close the tab; it offers no "Open GitOdile" button, because the
   app receives the session by itself.
4. **Back in the app.** The waiting dialog closes by itself, the window comes
   forward, and a brief notice confirms "Signed in" with the plan in one line.
   The rail control becomes the person's avatar (round, with
   `--avatar-ring`): the initials of the first and last name they set, never a
   hosting account's picture. From then on opens a popover with name, email, a
   `PRO` capsule when entitled, and menu rows: plan and billing, what the
   account stores, sign out.

The account control's avatar stays centred in the utility button's circular hit
area. A small static success-coloured dot at its lower trailing edge means a
session is active, with the same state available as an accessible description.
It is absent while signed out and does not claim that a network connection has
been checked. The dot does not pulse or compete with notification attention.

**Three identities, never interchangeable**
([ADR 0038](docs/adr/0038-hosting-account-profile-pictures.md)):

- the **project icon** is a rounded square (`--radius-identity`) made locally
  from an emoji, a technology mark or initials;
- the **GitOdile profile** is a round chip of the person's initials;
- a **hosting account** is a round picture from its provider, with the provider
  badge in account lists.

A surface shows the one identity it is about. Saved versions are about a
person, so every author, the user included, wears initials. The account picker shows an
account's picture in its 28px glyph slot without the badge, because the slot is
too small and the trigger already names the provider.

**Failure never implies lost work.** Every account error is a sentence of what
happened and what to do, followed by the reassurance that projects and saved
versions are unaffected: no connection ("Try again when you're online"), the
browser closed before finishing ("Nothing changed in your account or your
projects"), a sign-in that expired. None of them is `--status-danger`-filled;
they use the notice treatment, and "Not now" is always an equal way out.

Wording: "account", "sign in", "sign out" — never "log in", "register" or
"create an account", since creation is implicit. Name the browser step
honestly ("continues in your browser") and never say "securely" or "seamless".

GitHub and GitLab connections share one Accounts list per product in Settings,
grouped by host (the public host first, then company servers), followed by the
company-server inventory and the CLI tooling last. Each row names its method
(Token or Browser). Tokens work with or without gh/glab; browser authorization
and its saved accounts require the CLI. The token field is hidden until asked
for, masks its contents, explains secure storage/permissions before submission
and clears immediately when sent. Labels distinguish connection methods even
for the same username. Removing a local connection explains affected project
access and that it does not revoke authorization on GitHub.

Bitbucket uses the same Accounts list and token form for bitbucket.org only:
no method choice, no company servers and no tooling. Its form names the
Atlassian scopes in the permissions disclosure, and a token the provider
refuses says so in Bitbucket's terms instead of the generic access message.
Switching between provider sections renders the last known accounts at once;
an empty state appears only after the catalog was read.

Hosting connection selectors share one app-styled list in clone and project
settings. Show username, host and a separate Token/Browser badge, with a check
for the selected connection. Project settings shows only providers used by its
configured HTTPS fetch or push addresses, once those remotes are known. Multiple
providers appear only when the project actually uses both; local, SSH-only and
other-host projects have no provider account selector.
Retain unavailable saved identities and explain
that they need checking. Arrow keys preview choices; Enter confirms; Escape
closes only the list and Tab continues through the surrounding form. Opening
the list uses cached connections and never checks them remotely; saved
connections are verified in the background after launch (ADR 0027).

Repository browsing belongs to the clone overlay. Choosing a connection (or
the one preselected from last time) finds its first page of projects at once;
a cancelled or failed read waits for an explicit Find projects. Show page scope, private/archive
metadata, permission-limited results and keyboard-accessible virtual rows.
Choosing a project populates the normal destination review without starting a
clone. A filter must say which page it searches; a partial list cannot read as
the full account inventory. Opening a cached view does not refresh remotely.

The clone overlay uses two screens: Git address, GitHub, GitLab, Bitbucket and Azure Repos source tabs first; then the editable destination and native preview with
Clone project. There is no numbered step bar or separate confirmation screen.
Selecting a repository stays on the list and highlights the selection until
Choose destination. Retain virtualized rows and invalidate selection on account
or page changes. Editing a complete GitHub, GitLab or Bitbucket address or its connection starts a
debounced, cancellable read-only Git access check; opening the overlay or a
cached list never does. Confirm only read access, keep missing/private ambiguity,
and offer continuing without checking for transient failures. Use the same
exact connection as cloning. The input explains the network check before entry.

Provider browsing gives the remaining dialog height to its virtualized project
list. The heading, source tabs, connection, search and destination action stay
fixed; only the list scrolls. Refresh belongs inside the search capsule, with
an accessible name and busy/cancel feedback. Compact rows show the project name
in primary ink, the owner in secondary ink and at most one description line.
The list uses the app's shared auto-hiding scrollbar and normal keyboard controls.
Page scope stays in the filter label and compact counter; page arrows appear
only when there is another page to reach. Permissions guidance belongs to empty
and denied-access states rather than a paragraph above every populated list.

## Content design

The interface should explain Git in plain language while preserving technical truth.

**Application versions use the plain number.** Show `X.Y.Z` without a `v`
prefix in About, What's new, Settings, the update restart dialog,
notifications, Console, tooltips and accessible names. Badges and release
headings need only the number where their context identifies it. Prose uses
"version" / "versión" when needed: "Installed version: 0.3.1" / "Versión
instalada: 0.3.1", never "You have v0.3.1" / "Tienes la v0.3.1". Technical
identifiers such as Git tags, release URLs and highlights filenames retain
their exact format; this rule concerns app-owned presentation text.

Good:

> You have 3 saved versions that have not been published yet.

Less suitable as the default:

> Your branch is 3 commits ahead of origin/main.

Advanced details may display both.

Action labels should describe outcomes:

- Save version
- Publish changes
- Get project changes
- Set changes aside
- Restore this version
- Create separate workspace

Avoid vague labels such as “Continue” when a more precise action fits.

**A hint fits on one line; a note says one thing.** Most copy sits in a narrow
column under a label, so every extra clause becomes a second line of grey text
that nobody asked for. Say the consequence and stop: the reason behind a
safety measure belongs in the ADR, not under the switch. Prefer one sentence,
even a slightly longer one, over two short ones: two facts that belong together
join with a comma or "and" (“Only remote information is read, and your files
don't change.”). Start a second sentence only when the note truly needs one,
never to chop a thought into fragments, and never join with a semicolon or a
dash. The usual case that does need one is a fact followed by what to do
about it (“Couldn't reach GitHub. Check your connection and try again.”): a
statement and an instruction don't join well. How GitOdile proves something
is safe (ownership markers, staging folders, state tokens) is implementation,
never copy; say what stays safe instead.

**A notice on a screen is one line.** Every in-screen notice or banner —
History's, Changes' failed read and discard result, the automatic-updates
warning, Branches' detached and unborn banners, Home's Git notice, the skipped
restore at startup — reads as one row: its icon, the title in the strong
weight, then the explanation in the secondary ink on the same line, cut short
with an ellipsis and the whole of it on the text's tooltip, and any action at
the end, centred on the row. A notice is read at a glance and the screen's
content is what it sits over; stacked, the title and its sentence spent two
lines and a gap to say what one line says. The explanation gives way first;
the title truncates only once the explanation has nothing left. Where the row
is too narrow for its actions as well (the automatic-updates warning, with
two), the actions wrap to a row of their own, at the end, and the text keeps
its one line.
Tones, colours and actions are each notice's own. Dialog banners
(`DialogBanner`) are not in-screen notices: they state a consequence before
it happens and wrap to show all of it.

**One voice across both languages.**

- An error names what failed without a subject: “Couldn't read this file.”,
  not “We couldn't…” or “GitOdile couldn't…”. Name GitOdile only to tell it
  apart from Git or from the user.
- English is American (“favorites”, “color”), and names in running text sit in
  curly quotes: “main”. The apostrophe is the straight one (`couldn't`,
  `file's`), never `’`: the two look alike on screen, so a mix goes unnoticed
  until a test searches with the other. `copyTypography.test.ts` enforces it.
- Spanish is Spain’s: *ordenador* for the computer, always, because *equipo*
  already means the team (“tu equipo la sigue viendo”). Get project changes is
  *Traer cambios del proyecto*, retry is *Reintentar*, done is *Listo*, and
  names sit in angle quotes: «main».

## Core screens for the first design pass

1. Welcome / open project.
2. Repository overview.
3. Changed files and diff viewer.
4. Save-version flow.
5. Sync/publish flow.
6. History timeline.
7. Recovery center.
8. Conflict resolution.
9. Settings and Git diagnostics.

Each screen must define loading, empty, success, warning, and error states.

**A render error never blanks the window.** Each screen, each Work tab and
the app itself sit inside an error boundary. A failure shows the error form of
the empty-state block in the place of what failed — "This view ran into a
problem", a sentence that the project was not touched, `Try again`, and the
technical message behind a `Technical details` disclosure — while the rail,
the status bar, the other screens and the Work tab pair keep working. Outside
every screen, the window's own notice offers `Reload window`.

Reuse one visual pattern for all of these across screens rather than each screen inventing its own: a centered block with a small icon in a bordered/shadowed circle (`--radius-round`, like every glyph tile), one short headline, one line of supporting copy, and 1–2 actions — see `.empty-state` in `src/shared/ui/primitives.css`, first built for the "no project open" Overview state. An error state swaps in `--status-danger`. Loading is not this block: it draws the content's own shape, below. Do not build a bespoke illustration or a different card shape per screen — that's how a "no repository" panel and a "no results" panel end up looking like they belong to two different apps.

Two variants keep it one block rather than four. `.empty-state--success` is a
settled answer rather than an absence — Changes when everything is saved — so
its tile takes the success tone and rests flat. `.empty-state--compact` is the
same block inside something that floats or a dialog's list (the notification
panel, the clone dialog's project list): a 40px tile, body-size copy and the
host's own inset. A screen's block may set its width and arrange its actions;
it never draws its own tile.

**A list with nothing to show says so in one line** where its rows would be:
`.empty-line`, secondary ink at `--text-label`, centred, with a panel's room
around it, or `.empty-line--menu` with a popup's own inset (the palette, the
project and branch switchers, a picker). Eleven lists had written their own at
11, 12 or 13px. A sentence in place is not an empty list — a version with no
message, a release with no highlights — and keeps its prose styling.

**A first load draws the shape of what is coming, where it will be.** A list,
a sentence or a form whose shape is known before Git answers — the Overview's
changed files and recent history, the Changes file list, the History timeline
and a version's detail, the branches and a branch's route, project
settings, line endings, the Publish plan — renders its real layout with
`LoadingPlaceholder`: the same row classes as the loaded content, real
structure (a timeline's rail and nodes, a panel's own header) drawn as it will
be, and a faint `TextPlaceholder` for each run of words. The answer then lands
in a space that was waiting for it and nothing moves. The placeholders draw
only the shape: no count, name or state is guessed before Git has answered.

**Nothing shows for the first 320ms.** Most local reads answer inside that,
and a placeholder that flashes for a frame before the content is a flicker,
not progress. The delay holds under reduced motion; only the fade and the
pulse go.

**Content whose shape can't be guessed keeps the loading bar** (`LoadingBar`):
a diff, a screen whose code is still loading, an older page being appended.
**A refresh keeps what is on screen** and says so where it is — the card's
icon turns, a bar runs over the list, the status bar's item spins — and never
swaps back to placeholders. **A control doing work carries a spinner** beside
its verb ("Publishing…"), at the control's own size.

The Overview used to spin a spinner in each card while Changes drew the bar
over the same wait; one wait now looks the same wherever it is.

**Home is the one documented departure from the empty-state block.** Screen 1
is a front door, not a "nothing here" report, and it is shaped like a launcher
(Raycast, Arc's command bar) under a greeting (Claude's or Notion's home)
rather than like the centred icon-headline-actions block. The navigation names
it **Home** / **Inicio** (house icon); the screen itself never repeats that
word as a title.

- **Greeting.** The mascot sits left of the `h1`, "Good morning, Luis" /
  "Buenos días, Luis": the part of the day (morning until 14:00, afternoon
  until 21:00, evening otherwise) and the first word of the Git identity's
  `user.name`, dropped when there is none. Under it, in title size and the
  secondary ink, one question for that part of the day ("What are we working
  on today?"). Three per part; each arrival at Home picks one other than the
  last, and returning also empties the field and puts the cursor back in it.
  Each new question types itself at a brisk, uneven human pace (about 1.5s
  for the longest) behind a thin accent caret that blinks briefly and fades;
  the first arrival of a session waits for the mascot to draw itself, a
  return starts at once. The untyped rest already holds its place, so nothing
  moves, and screen readers get the whole sentence. Typing in the field, or
  reduced motion, shows the question whole.
  It never rotates while the screen is shown, because text that changes
  under the reader is a distraction.
- **Fitted to the window.** The block is centred horizontally and sits at the
  optical centre of the work area: the free height splits 2:3 above and below,
  so it rests a little above the middle. The whole block scales with the work
  area — one factor for type, icons, rows, radii and the column's width (720px
  at 1) — taken from the tighter of width ÷ 1240 and height ÷ 800 and kept
  between 1 and 1.5, so a large screen gets a launcher in proportion to it.
  It never shrinks below 1, so the 10px type floor holds; a small window
  scrolls instead. The position is the
  rest state's (empty field, Recent tab): while the person types or browses an
  account the space above is held, so the greeting never moves as the results
  grow and shrink, and is worked out again only when the window changes. The
  launcher never runs past the bottom of the area: when the results would (an
  account tab lists more rows than rest did, or the window is short), the
  results list scrolls inside the card with the shared auto-hide scrollbar,
  and the greeting, the field, the tabs and the three ways to start stay in
  view.
- **Launcher.** One raised card (`--radius-surface`, the Overview's own card)
  holds a field, the results and, at its foot, the three ways to start. The
  field has focus on arrival. Typing filters the recent projects (name matches
  before path matches, recency kept) and offers to create a project with that
  name; a pasted remote address offers to clone it, and flags a recent project
  with the same name; an absolute path offers to open that folder. The
  launcher only suggests: cloning opens the Clone dialog filled in, a path goes
  through the same open — and the same Rust validation — as the folder picker,
  and nothing runs merely because something was pasted. Enter takes the first
  suggestion, which is drawn selected (the light accent wash and an Enter
  hint); the arrow keys walk the field and the rows' main controls; Escape
  clears the query. Ctrl+K stays the command palette.
- **Continue.** With nothing typed and no project open, the most recently
  opened project leads the list as a larger row — kicker "Continue where you
  left off", path and when it was opened — whose accent-filled pill is the
  screen's one accent and breathes once (`.attention-breathe`). Enter in the
  empty field opens it. It is not listed again underneath. With projects
  already open, Home answers "what else?", so there is no Continue.
- **Recent and Favorites.** Under the field, two small tabs appear once there
  is a favourite; Favorites lists only those, and is a view, not a setting.
  The star on each row is the **same favourite the project popup shows**,
  from the same store and with the same strings; it is rendered at rest when
  marked, and the row's Remove is shown
  on pointing or focus, always where there is no pointer). Both float over
  the row's right end instead of reserving a column, so at rest each row's
  "opened 8 minutes ago" lines up with the card's edge and with Continue's
  pill, and gives way to them on pointing or focus; a marked favourite keeps
  its star and its time steps left. Recent lists
  newest first, five rows including Continue; searching reaches every stored
  entry. Each row carries the project's own avatar, the same colour and
  initials the status bar and its project popup give it; the name is the row's
  accessible name and the path its description.
- **The three ways to start** — create, open, clone — sit at the card's foot
  as three identical secondary capsules with short labels ("Create", "Open",
  "Clone"), each accessible name the full label it begins with and its hint as
  description and tooltip. They are peers, with no accent on any of them:
  which is right depends on what the user already has on disk. Opening is the
  only one that runs here rather than in a dialog, so its own capsule carries
  the progress. Beside them, one quiet line says a folder can be dragged onto
  the window.
- With no recent projects yet, the field asks for a URL or a folder path to
  paste.
- **Setting the computer up lives inside the same card**, so Home stays a
  greeting and one object. Everything it shows is already read locally — the
  Git diagnostics and identity App reads after first paint, and the account
  receipts the launch sync keeps (ADR 0027) — and none of it reads a
  repository or the network.
  - *First run.* With no recent projects, the results area that would be
    empty holds "Set up GitOdile": Git installed, your name and email, and a
    GitHub, GitLab or Bitbucket account marked Optional, with "1 of 3" and a
    thin progress bar. The next step gets the light accent wash; while it is
    required its glyph is filled solid and breathes once — the screen's one
    accent, which Continue cannot contest because there is nothing to
    continue yet. The optional account never takes the accent. "Hide" is
    remembered on this machine. The steps wait for every answer, so none
    flashes as missing, and they go once all three are done or the first
    project is opened.
  - *Git missing or unusable.* The one blocking problem gets a warning-toned
    notice between the field and the results: "Install Git" (or "Open
    Settings") opens Settings › Git, where installation already lives, and
    "Check again" re-reads the diagnostics — only on that press, never because
    Home became visible. It takes the accent, Continue turns neutral, and
    every control that would touch a project is disabled.
  - *Status line.* Otherwise the card's foot, under the three ways to start,
    ending in the app search (ADR 0032), the field the command palette
    deploys from on Home, its results as wide as the field. Before it, it
    says what this computer is set up with, each part a quiet control into its
    own Settings section: Git's own mark (the one Settings uses) beside
    "2.55" — no word, no check: the mark names it and the version is the
    fact; major and minor only, the full string such as `2.55.0.windows.3`
    in its tooltip and "Git 2.55" as its accessible name, the identity's name
    beside a person icon (its tooltip and accessible name say "Saving as…";
    in the warning tone, "Add your name and email"), and "Connect an account"
    at the end, which shrinks to a "+" once there is one. Accounts appear
    here — one entry per provider, its mark and login or "2 accounts" — only
    when the launcher has no account tabs; with tabs, they would be said
    twice. While the launch check (ADR 0027) is still coming and no saved
    connection is usable yet, the accounts are unknown rather than none: no
    "Connect an account" and no first-run account step until the check
    lands. Their places are held instead (§ Core screens, first load), and
    counted from the receipt rather than guessed: one placeholder tab per
    provider whose saved connection is still being checked and has no usable
    account yet, so GitHub finishing before GitLab never leaves GitLab to
    appear from nowhere; a single one only when nothing is listed yet (gh and
    glab sessions show up once checked). The status line keeps a placeholder
    entry for each fact still being read — Git, the identity, each pending
    provider — and holds back "Connect" / "+" until the check lands, so it
    never changes under the reader. With no recent
    projects, the first-run steps draw their shape the same way. Like every
    first-load shape, nothing shows for the first 320ms. Never the email:
    the line is on screen whenever Home is, including while it is shared. A
    missing Git is not repeated here.
  - *Account tabs.* Each provider with a connected account adds one tab
    beside Recent and Favorites, with its mark and name; a provider with more
    than one account shows a chooser inside, rather than a tab per account.
    A provider can hold any number: browser or CLI sign-ins (`gh` and
    `glab` keep several) and saved tokens, on the public host or company
    servers. Each choice says only what tells it apart — the login, then
    "Account" or "Token" when the choices share a login or mix sources, then
    the server when they are on different ones ("martinezelx · Token",
    "luis · Token · git.acme.dev"). Two accounts are two small buttons;
    three or more become one compact menu. With a chooser, the section
    heading drops the login ("Your projects on GitLab"). Choosing it is the one network read
    Home makes: the account's first page of projects, through the same
    repository browser as Clone. Typing narrows them; Enter or a click opens
    Clone filled in with that address; "See all in Clone" opens Clone on that
    provider's tab, with the same account chosen, when there are more.

Home can be revisited with projects open. Its recent list keeps the
projects already open and says so: an "Open now" tag where their age would
be, and on the active one an accent ring round the avatar. Choosing an open
project switches to it, the way the project popup does, rather than opening
it again. The active project stays active — it is still open, and Back
returns to it — but no destination is marked current. Back returns to the project screen that led here;
Forward can revisit Home until another navigation. Home carries no status
bar, open project or not: the launcher's own status line is about this
computer, and the active project's state is one Back away. The
mascot's entrance plays once per application session; later visits show it
blinking, without another entrance. Home owns the app's only
`h1` while no project is open; the shell does not additionally title it
"Overview".

**With a project open, Overview is the Journey page** (§ Layout concept,
Primary workspace): it answers one question — what do I do now — and then
shows where all the work is. Top to bottom: a one-row breadcrumb (the
project's own icon, name, where the project lives as a chip, and the folder
and settings glyphs at the end); the next-step card; and a
timeline beside the project's properties.

The **next-step card** is derived by `deriveNextStep` from the same journey
the status bar reads: overlaps first (blocked, "Resolve overlaps"), then
unsaved work (unsaved colour, "Save version" with "Review changes" beside
it, and a neutral "Then:" pill for what waits on the remote, or for
publishing what is about to be saved: "publish it along with 4 more" counts
only the versions already saved, since the one being saved does not exist
yet and the work may be saved in several; "publish it" when nothing else
waits. "Save your first version" in a project with none), then the
remote side once everything is saved — versions to publish (accent, "Publish
all N" and "View history"), newer versions on the remote (incoming colour,
"3 new versions on origin", who sent them and how many files, "Nothing of
yours overlaps." and "Get 3 versions"), both sides moved without overlapping
(incoming colour, "origin has 2 new versions and you have 1 unpublished",
"Get and combine" beside "Get and publish"), an overlap (danger colour,
"Your changes and origin's overlap", the first file, "See what overlaps" and
no primary action), something of the person's in the way (warning colour,
what it is and "See why"), not checked, checking, a check that failed (calm, a red glyph,
"Your work is saved", "Try again"), no remote ("Saved on this computer",
"Connect a remote"), no upstream, an older version open ("Choose a branch"), unborn, and finally "Saved and published" with no action. Its title
leads, with no kicker or progress bar above it. The band is washed with 7%
of its state's tone — amber with unsaved work, the local green ready to
publish, the remote's blue with newer changes, red when blocked — and the
same tone inks the glyph on its neutral circle. With nothing
waiting the band is the plain sheet.

The **timeline** is the History screen's shape: the incoming row (one blue
line above *now* while versions wait on the remote, leading to the review and
get flow), *now* (one line with the unsaved count and its kinds as glyph
counts, leading to Changes), the versions only on this computer grouped under
an "On this computer" chip with half-filled nodes (its glyph in the unsaved
ink with no remote), a "Published" chip where the remote's copy begins (the
remote, and the branch when it differs from the one stood on, in its tooltip),
then published versions, six in all with "View all" in the card's corner. Rows keep "You" for
the user's own versions and the "current" badge.
The **side column** is `OverviewDetail`, choosing its detail with
`overviewDetailMode`; with no detail and no discard it renders nothing and the
timeline takes the width. Its data never
loads because Overview became visible: the composition root reads the files of
each unpublished version when the unpublished list changes (once per version,
since a saved version never changes, at most 20), the incoming versions when a
remote check finds some (through `list_incoming_versions`, which reads the
tracking ref the check already moved and never fetches, once per pair of
commits), and the newest discard on a working-tree invalidation — all
idle-deferred, into a feature-owned cache (`workDetail.ts`) the column only
renders. "Restore" sets Changes' restore intent, the same intent pattern
History uses for a selected version. The folder glyph in the breadcrumb opens
the project's root in the system file manager through `open_project_folder`,
which resolves the folder from the open project and never from a path the
renderer sends. Under 980px the column drops below the timeline.

Text diffs in Changes and History use the same capsule-and-tint language as
rendered Markdown: a 5px capsule in the existing line gutter, filled for an
addition and outlined with a 1.5px edge for a removal, without plus/minus
signs. One capsule spans each run, a contiguous stretch of one change kind in
one column of one hunk, through its wrapped and empty lines. It opens and
closes `--space-1` inside the run with `--radius-pill` ends, so neighbouring
runs read as separate units; split view caps each side's runs on its own.
Forced colours draw the same capsules with native borders. Unchanged lines
keep the same content alignment. Both unified and split views retain their line numbers and hidden
Added/Removed labels. Code uses the normal text ink and syntax-token colours,
with the existing diff tints behind it. The accessible plain-text diff retains
its patch signs. No extra preference is needed.

In unified text view, a removed run directly followed by its added run in the
same hunk is joined: one capsule continues across the boundary with no cap
between them. Over `--space-2` on each side the outline's inside fills, the
capsule colour passes through the OKLCH midpoint of the two diff colours, and
the soft row tints blend through their sRGB midpoint. Text and exact-fragment
marks stay sharp; row dimensions and split-view fills are unchanged. Forced
colours keep the capsules without gradients or masks.

Paired replacement lines additionally mark the exact changed fragments with
`--tint-halo-focus` of their diff colour, over the existing `--tint-fill` row,
softened by the 2px highlight radius.
Full-line syntax colours and search marks remain intact. Only changed spaces
and tabs carry decorative middle-dot and right-arrow glyphs; the original
whitespace remains selectable and copyable. Cap decorative spacing glyphs at
64 per source line, retaining the remaining whitespace as original text with
its changed tint, so one long line cannot defeat virtualization. Bound comparison work; a large or
unrelated replacement keeps its whole-row marks without inventing precision.
Split text views keep Before/After headings outside the scrolling code, using
`--surface-code`, the normal inner-strip label scale and a region hairline.
Changes names the last saved version and current working copy; History names
its actual comparison base (or empty project) and selected saved version.
Explicit change-arrow navigation briefly outlines the affected line groups in
`--text-secondary-color` for `--attention-duration`, inset `--space-1` from the
panel edges with `--radius-item` at the group's first and last line. The static contour never
changes row dimensions or animates, including under reduced motion, and only
an explicit jump starts it; file activation and background refresh do not.
Forced colours underline changed fragments as well as retaining the
filled/outlined capsules.

Changes offers **Markdown preview** in its View picker for `.md` and `.markdown`
text files that are not conflicted, selecting it by default. Remember explicit
Markdown choices across sessions independently of code-file view choices.
If a read fails or the document exceeds size/comparison limits, show the text
diff with an explanation; keep the preference and offer retry through View.
It compares complete saved/current documents,
highlighting affected blocks in red/green with the text diff's capsule and
tint, and no minus/plus sign, in one unified document. Each block is one
closed capsule at its inline start (a table row's on its first cell); the
removed one is outlined and the added one filled, so the two read apart by
shape and not by colour alone. A removed block directly followed by its added
block joins it as in a text diff, trading its paragraph gap for padding so
both tints meet. A changed code block scrolls inside its code so its capsule
stays in place. Unchanged context appears once; a replacement shows the removed block
before the added block at the same position. Compatible lists, tables and quotes
merge their items/rows so shared context stays in place. New files show additions;
deleted files retain their saved content and disclose deletion. A summary counts source-line
changes and explains the block-level granularity. Document typography stays on
the solid diff surface, with a compact read-only notice. The change arrows step
between groups of affected blocks; diff search remains hidden while previewing.
Oversized documents can show isolated changed fragments from the cached text
diff, clearly labelled partial, with source-line positions and a warning that
omitted context can affect formatting and references. Separate fragments never
join into one Markdown construct. Further limits disclose omitted changes;
unavailable excerpts retain the text fallback. Switching back restores the chosen diff mode. Conflicted files
retain their diff. HTML is hidden, images are text placeholders,
and links are inert so repository content cannot navigate the desktop WebView
or load resources. History and word-level rendered changes are deferred.

**Changes saves from one place, and it is the place the files are.** The
screen used to offer a version twice: a primary "Save version" in the
heading that opened the dialog, and the quick box docked under the file list
that saved on its own. Both were the same form — name, details, "also
publish", the hooks escape — differing only in that the dialog stated its
plan and the box did not; opened together they put two accent-filled buttons
on one screen, which is the thing the Journey page's band was built to stop
("a button under the band said the tile twice"). Now the box is the one save
control on the screen and the heading carries only the title and the state.
**The box is a composer docked under the list, not a card that grows out of
a field.** It is a section of the list panel — a hairline over it, the
panel's own background — the way GitHub Desktop and Fork dock their commit
box. At rest it is one row: the name field, a pill like every single-line
input, and the Save button beside it, so the one thing to do is visible
without a click and nothing decorative stands in for it. An earlier version
led the field with the Overview band's solid, breathing glyph circle; it
looked like a button and was not one, so it is gone, and the breathing halo
stays the band's. Focus opens the box upward without changing its shape:
the plan over the field — `3 of 7 files → main`, the count first and the
line in the status bar's own type, since the panel header is the tab pair
and names no branch — then the details, only the notes the plan line cannot
say (a first version, changes already prepared, no branch to land on; files
left behind are the branch's to count), any failure, and a foot with "Also
publish" and the button. The plan is Rust's answer and lands a beat after
the box opens, so its line is held open at its height from the first frame
and the text arrives with the list's own row entrance (`.row-in`) rather
than snapping on. The details are a textarea at `--radius-control` that
grows with what is written, to about eight lines, and then scrolls: room for
a long message without a second, bigger frame to write it in. The two
placeholders are a pair of questions — "What changed?" over "Why?
(optional)" — so the name says what changed and the details say what the
name cannot, and "what changed" rather than "what did you change", because
the change may be an AI's or a teammate's. "Also publish"
is a checkbox, because it is an option of this save and not a setting that
takes effect on its own, and the button says the consequence: "Save", or
"Save and publish" — at the list's width the longer label takes a line of
its own under the option rather than clipping either. While saving it says
only "Saving…" beside its spinner, at a button icon's size, so the row keeps
its height and its line. A failure prints the localized message and, under
it, what Git said behind the same "Show technical details" toggle the dialog
uses — open from the start when a hook rejected the version, since the
hook's output is the only thing that says what to fix — then the one-time
hooks escape. Saved, the plan's slot says what was saved in one line, with a
check in the success colour, and "Publish now" takes the place of "Also
publish" at the start of the foot: a secondary button level with Save, the
step left to do for a version whose option is spent, and not a second
primary, since the band's Publish tile says that step in full. It is absent
when "Also publish" already took the reader there, and the next keystroke
brings the option back.

**The box folds only when leaving it loses nothing, and never under the
pointer.** It closes when focus leaves it with nothing written and nothing
in flight; a draft or a save keeps it open automatically. An explicit close
button at the right of the plan line, visible only while expanded, and Escape
fold it on purpose while preserving the draft and options. The close uses a
14px X in a small transparent button, secondary ink, the item radius and the
shared hover/focus treatment; it is disabled while saving or creating a branch.
Explicit closing moves focus to the composer itself so it neither disappears
with the button nor immediately reopens the field. Pressing inside the box on something that takes no
focus — the option's words, a disabled Save, the plan line — is not
leaving. Neither is the window losing focus: minimized or behind another
app, the page keeps its focus on the field and hands it back on return, so
the box stays as it was rather than folding and springing open again. A
press somewhere else — a file row, the History tab, the diff — lets its
click land first and folds after, without the scroll anchoring an open
gets: folding between the press and its release moved the list under the
pointer, and the release landed on another row or on none. A keyboard move
away folds at once, since there is no click to protect. The rule is one hook,
`useDockedComposerFocus`, shared with the new-branch box on Branches, and the
layout is one primitive, `.docked-composer` in primitives.css, so the two
docked boxes cannot drift apart. A request in flight disables the fields,
which drops focus to the page; when it ends, focus goes back to the field
unless the reader has put it somewhere else, so the box can still fold
when they leave it.

The flow underneath is one implementation (`useSaveVersionFlow`) in two
frames: the box here, the modal dialog on the screens with nowhere to type —
Overview's active tile, saving before switching a branch — and the notes and
the failure detail come from one place so the two cannot explain a plan or a
failure differently. The box offers no way into the dialog: it would be the
same form in a bigger frame, over the list whose checkboxes stay live while
the box is open, and a second route to one form is what this screen stopped
doing. One accent fill in every state of the box: the button. **The panel is
the card.** The screen's name and its
state used to be a page row over both panels — the Linear-style header a
workbench does not have (GitHub Desktop, Fork, Tower and VS Code all start
their panels at the toolbar), with a trailing corner waiting for view
controls that live in the panels. A miniature of the Overview band was tried
there and read as decoration: the rail already says where you are, the
status bar what is unsaved, and three grey dots that do nothing answer a
question nobody asks on this screen. So the list panel's own header is the
row, at the height of a strip (`--strip-height`), because the diff panel
beside it keeps its one strip — the file's icon, its name, its folder, its
category, the reading controls — and the two must start on the same pixel
row. Both are fixed: a header that grew with what it said would be a strip
that never stayed level. **The header is the Work screen's tab pair**
(task 126): two equal halves, Changes and History, the way GitHub Desktop
heads its sidebar. Each tab is its glyph — the one it carried in the rail
while it was a screen — and its word, set in the title's own type (size,
weight and tracking), so switching moves nothing; only the colour changes:
the active word goes primary, its glyph takes the accent, and a 2px rule in
the accent sits on the header's bottom edge under it. It is the rail's active
colour, not the band's "do this" fill: a tab is where you are, not what to
do. The Changes tab carries no count, because the status
bar and the band already say it and nothing is counted twice. The tab pair is
drawn in every state the panel has — loading, nothing to review, listing —
because it is also the way to the other tab; and it stays put while a tab's
chunk loads, in a loading shell of the same column. The search strip under
the header steps down to `--strip-height-inner`, the way History's inner
panes step down from their panel; the diff needs no second strip and starts
its code under its header. The **include-everything checkbox heads the
search strip**, at the rows' own inset, so it reads as the column's head
(GitHub Desktop heads its list the same way) and the search box takes the
rest of the strip — the shape History's strip has — with the
discard/restore `⋯` at its end: it acts on the list it heads, and it stays
out of the save box, so the destructive menu never lives inside the primary
control. It drops down and across the diff so what is about to be discarded
stays in view. The breakdown and the line totals the header used to
carry beside it are gone: a row of counts between the strip and the files
took a file's height to say what the Journey band and the status bar already
say, and a partial selection is the checkbox's own mixed state and the save
box's plan ("3 of 7 files → main"). Nothing is counted twice. With nothing to
review the list panel keeps its tabs and says "Everything is saved" in a
state row at the inner strip's height, and the empty block — glyph,
headline, the way back to Overview — sits in the diff panel, where the
reading surface would be; in a one-column window the two stack. **History
follows the same shape.** Its timeline panel wears the same tab pair as its
header; its search strip steps down to `--strip-height-inner`; and the scope
— which history is being read, removable where it is stated — is a chip in a
state row under the search strip, drawn only while the timeline is not the
current branch's, so the common case keeps its rows one strip down. It stays out of the
filter chips because it is not a filter: clearing the filters must not change
the branch. Loading, failed and "no saved versions yet" keep the timeline panel
and its tabs, with the state block in the detail panel. The
card is a single surface: the version strip carries the subject at
`--strip-height`; its
trailing `Details` opens the story (the full message, what the diff is compared
against, and the commit's facts) without displacing the diff; and `⋮ More`
carries the version's actions. There are no tabs: the file list and the diff
are always the working surface, and the reading controls — the two step pairs,
a find that expands from its icon, and the view picker — live in one toolbar
across the whole card, over both panes, with the file search stepped down into
its own pane so that toolbar keeps a whole row's width at any window size.
Renaming and deleting a branch stay on the Branches screen rather than being
duplicated in every menu. The version strip is a fixed `--strip-height`,
not a minimum: the timeline panel's header beside it is exactly that, and a
strip that grew with its two lines sat its rule ~20px below the tabs'. It is
one line, as Branches' strip is, and the subject has it: at the trailing end
come only the timeline row's own shorthand — the laptop glyph with its
tooltip for a version that has not left the machine, the author avatar ("You"
for the user's own, the name on its tooltip) and when, said relatively with
the exact date on hover. Published draws nothing, as on the row, and neither
does an unknown answer, because a strip must not say "no idea"; `Details`
states both in words. A second line used to spell the author out and name the
branch pointing here, "current" for the one stood on: the status bar already
says where the project is, and `Details` lists every reference. The
open file's category in
the diff header is the same glyph with the word beside it rather than a
pill: a third shape for one fact the row and the band already draw alike.
The diff strip also carries History's find — one shared control — so a search
inside the open difference is the same gesture, in the same place, on either
tab. Which tab is showing is the project's to remember, like its selected
file: Back and Forward move between screens, as they do in GitHub Desktop,
and a project left on History comes back to History. A hand-off from another
screen — the band's tiles, "view on History" from Branches, the palette's "Go to
Changes" and "Go to History" — opens Work on that tab.
The "everything is saved" state's circle is the band's done tile, light fill
and no shadow, since nothing there rests on anything. The shared
`.app-checkbox` remains the checkbox for option rows — the History filter
panel, a save's "Also publish" — that same light fill with the tick in the
accent. A list whose items go into one action does not use it — the Changes
file list, and the branches a clean-up deletes: its include control is History's
timeline node at 10px (`InclusionNode` in `shared/ui`). Filled in the node fill means the file is in, an empty
ring means it is out, and a half moon means only part of a folder is in. The
accent belongs to the file that is open, as it does on History's selected row;
the include state itself is carried by the fill, not by a second green
mark. The node sits in an 18px leading column, 4px narrower than the tick it
replaced, and the label around it carries the hit area without spending layout
width. A solid accent control is still reserved for "do this". **A row that
arrives while the screen is open animates; the list the screen opens with does
not.** Work is a surface you act on, so it is readable the instant it appears —
nothing assembles itself — and `.row-in` is kept for the work that genuinely
shows up: a file the watcher just noticed, a version just saved. `useRowArrival`
(rowArrival.ts, shared by Changes and History) decides that, and the two tabs
answer it the same way: any file added to the Changes list, and only a commit
prepended at the head of History's timeline, so loading an older page is not
mistaken for new work. Up to three arrivals cascade, 40ms apart, so a late
arrival never waits on a position that has nothing to do with it, and a
virtualized row is still never animated by a scroll that mounted it. Overview
and Home show their existing lists without an entrance stagger.

**Overlapping changes is a screen you are sent to, never one you visit.**
A paused merge, rebase, cherry-pick, revert or patch series is temporary, so
the screen has no rail entry: Overview's `conflicts` state, a notice above the
Changes list, the palette (only while something is paused) and the dialogs
that refuse to act because something is paused lead to it, and Back returns
to where the reader came from. It is the Changes pairing — a file list panel
and a reading panel edge to edge at `--panel-column`, the same one-column
list/detail switch below 1024px — under one header band that names what is
paused with real branch names and its step, with progress in the file groups.
A merge GitOdile will resolve needs no card: the header already says what is
paused, and a "you can look around safely" card said the same thing on every
visit. An operation it cannot finish gets one `warning` card — nothing is
lost, continue or cancel it with the tool that started it — whose
`Technical details` disclosure holds the operation, both sides' refs and
commits, the snapshot, and the exact continue and cancel commands as text
with a Copy action each, never a button that runs them. Files carry no
technical details of their own: stage modes and object IDs answered no
question a reader of this screen asks.
Each row says the overlap in words ("Deleted on “main”"), never by colour
alone. The reading panel's strip carries the file's name and the overlap in words.
The list's SearchBox carries the same FilterPanel trigger, active count and
removable chips as Changes and History: pending/resolved status and actual
filename extensions intersect the text search. They filter the cached listing
only and are remembered per project session. The extension choices are bounded
by virtualization; arrows, Home/End and Tab can reach every checkbox, including
one outside the currently painted range. A filtered count never becomes
the session's total or enables Finish; partial listings remain explicitly partial.

Under the file strip both sides show at once as two equal columns, the way IntelliJ IDEA puts the two
versions either side of a merge — the actual branch on the left and the incoming
branch on the right, each named with its role and a branch glyph over a
diff in a scroller of its own. The overlap is the two of them together; a
picker between them hid half of it. The columns are the layout, so there is
no reading-mode picker: each side is one unified column, and below 720px the
columns stack. The panes start right under the
screen's header hairline, with no band of their own above them. Each side is
drawn against
the common base with the Changes diff renderer; a side with nothing to
compare as text (deleted, a link, a submodule, a changed kind) says so in a
sentence instead of drawing an empty diff.

**The file's identity and actions share one compact strip**, at the existing
panel-strip scale, wrapping into regions when names or available width need
it. The name and overlap stay on the left; a shared “Keep version from” label
introduces the branch-name buttons, each with a branch glyph (a check when
selected) and its full Keep action in the tooltip and accessible name.
Mark resolved is a circular
primary check with its localized tooltip and accessible name; its confirmation
keeps a visible action label. Delete, Open in editor and Reset are its small circular secondary siblings, named
by localized tooltips and accessible labels. Delete uses the danger ink and
still asks for confirmation; Reset opens its existing confirmation directly.
Feedback such as "Kept “main” · not marked resolved yet", marker warnings and
busy explanations belong under the file identity, outside the button group.
Resolved is stated once in the file description, with no duplicate above the
Reset button. Long branch names and explanations wrap within their region;
branch-choice labels truncate with the full accessible name and tooltip.
Side headings use the inner-strip scale and retain the full
"What this branch changed" description for assistive technology. The screen
header keeps the real merge direction and its paused state; progress lives in
the pending/resolved list groups and remains available to screen readers.
Open in editor opens the file in the application its type opens in and asks
nothing, since it changes nothing. Success is announced to assistive technology
without adding a persistent message or moving controls in the file strip.
Once an edit comes back
the left says what it left — overlapping parts still marked (in words, with a
`warning` glyph), none, or why GitOdile cannot look (not text, UTF-16) — and
Mark resolved still asks before taking a file with markers. A type the system
would run instead of open is not opened: a `warning` notice under the bar says
so and offers Show in folder. The kept side's
button stays pressed (`aria-pressed`, the selected recipe of
`choice-list__option--active`) and carries a tick, so the choice is never
told by colour alone. Choosing a side never runs on the first press: **the
question takes the bar's place**, as the forget row of Restore takes its
row's — a `--tint-fill` of `--status-danger` behind the title ("Keep the
version on “feature”?"), what the other side loses and that a copy is kept,
then Cancel and the verb in `danger-button`. While it is asked, the column
that would be replaced is dimmed to `--opacity-muted` and its heading says
"Will be replaced" in words. Mark resolved asks in the same place the first
time only, in plain words with the exact command behind Technical details;
markers left in the file ask again in the `warning` tint with "Mark resolved
anyway", and sides that disagree on running as a program ask which to keep.
Escape cancels any of them and focus returns to the button that asked.
**Reset is a dialog**, `s` in the `danger` tone, because it throws away what
the reader wrote: what is undone, then the safe fact that what the file
holds now is kept. When the snapshot could not keep the original content it
says so in a `warning` banner and offers to reset the overlap alone. A
moved session, a file another program holds and a refused action are
in-panel notices under the bar with their way out (Read again, Try again);
while another change to the project runs the bar holds its buttons and says
why. A finished action is announced and hands focus to the file's name.
A file no whole-file choice can handle — a folder where the file goes, a name
the disk cannot hold apart from another overlapping one, a name GitOdile
cannot spell — gets one `warning` notice in the same place saying what to do
instead, with the step GitOdile can take toward it (Show in folder, or Open
project folder for a name it cannot spell) and Read again.

The header has no permanent Refresh action: repository invalidations already
refresh the cached conflict session. If watching is off or unavailable, the
same AutomaticUpdatesNotice as Changes offers a focused update and Settings;
read errors and stale-file notices retain their contextual retry/read actions.

**Finishing and stopping are the session's actions**, at the end of the header
band: Stop… with `Undo2` as a `secondary-button`, Finish… with `Flag`
last as the solid primary. Full Stop/Finish combining names stay in their
accessible names and tooltips. The flag distinguishes the session's finish
from branch glyphs and the file's resolved check. Finish stays visible while files still
overlap, disabled with the reason as its description and tooltip, and both
hold while another change to the project runs. Neither is Back, which only
leaves. Finish is the Save version dialog's sibling: `m` in the `local` tone
with a merge glyph, the sides in the subtitle, three facts (the version it
saves and how many files, whether hooks run and Git signs, then the safe fact
that nothing is published and unsaved files stay), the version name and
details prefilled from Git's prepared message, a failure banner that opens a
hook's own output, and Technical details with the exact command. Its result
offers Publish changes as the primary and Done beside it; Done and Publish
both return to the screen the reader came from, and nothing is published
unless Publish is chosen and confirmed in its own dialog. Stop combining is a
confirmation that removes work: `s` in the `danger` tone, the body naming
which branch goes back, an `info` banner when the merge was started outside
GitOdile (it can't promise unsaved changes from before come back), facts for
what goes back and what stays, the safe fact that a copy is kept, and the
`danger-button`. Its result is a toast, and the screen returns to where the
reader came from. A moved project re-reads the plan in place and says so in an
`info` banner.

**Dropping a folder on the window** opens it. While a drag is over the window
— and only then — a window-sized overlay names what a drop will do. It is
feedback about a gesture, not chrome: it never takes the pointer (an overlay
that swallowed the pointer would cancel the drop it invites), it stays out of
the accessibility tree because a drag has no keyboard equivalent to narrate,
and it does not appear under a blocking dialog, which is exactly when a drop is
ignored. Its dashed edge is the only dashed border in the app and is meant to
stay that way: dashes are the universal "drop here" mark, and a solid edge at
that size would read as a dialog.

**About separates what a maintainer needs from what the product is proud of.** Technical details answer "why is it broken on *your* machine": the platform, its build, the webview, the Git it found — all things that differ per install, and all things the copy button puts on the clipboard. Built with answers "what is this made of": Tauri, React, Rust, which are identical for every user of a given build and therefore explain nothing about a bug. Mixing the two produces a diagnostics block nobody can act on and a credits list nobody reads, so they are separate sections in separate shapes — label-and-value rows for the facts that vary, and, for the ones that do not, three rows that put the mark beside a small name-over-version block. The credits were capsules first, then bordered tiles (a mark above a name above a version), then an inline lockup, then rows that pushed each version to the right edge; the tiles gave a fact nobody reads a surface of its own, while the other two either crowded the marks or tore the number away from its name. The beside-the-mark block keeps name and version together and lets three credits sit in one band without shrinking type, which is why the fourth (the build tool's own language) stayed dropped. The heading is kept for assistive technology only, since a mark and a product name already read as a credit. Each credit is also a control that opens that project's own home page in the user's browser, because "built with Tauri" is a claim the reader should be able to check; it is a button rather than a link, since the destination is outside the app and an `href` would let a middle click navigate the webview the dialog sits in. It is a control, so it takes the pointing hand; the hand is what says the press leaves the app, and mark, name and version stay readable at rest so the credit withholds nothing without hovering. Its accessible name pairs the layer with the host it opens, so that fact reaches a screen reader before the press rather than after it, and every host is listed explicitly in the opener scope — an unlisted one simply fails to open. A value the app cannot establish is omitted, never filled with "unknown": a missing row says nothing, and a fabricated one sends a bug report the wrong way.

**About names the product together with its promise.** The mascot leads at hero scale, then the correctly cased `GitOdile` name, then the localized promise. The name takes `--text-hero` and the promise `--text-title`, so the hierarchy comes from the scale rather than from three unrelated sizes, and the decorative mascot is hidden from assistive technology. The "Odile" half carries a light sweep in step with the mascot's wink — in the accent fill under a community theme, and in the ink's opposite under the GitOdile themes (white crossing black in light, black crossing white in dark), whose fill is the ink itself — the same 6.5s cycle and 1.2s start, the eye shut while the light is halfway across its 14% travel — so the wordmark and the mark move as one gesture, and reduced motion clears both. The `h2` still carries the name and the promise, so the dialog's accessible name identifies the app before stating its promise; the close control sits in the dialog's own corner above the hero rather than inline with the identity. The version moves into the top-left corner, a pill at the close control's own height and insets, so the two frame the identity as one header line; it still names the build exactly as Settings › Updates does. Machine-specific rows sit under `Your system` / `Tu sistema`, not `Technical details`: platform, OS build, WebView and Git describe the reader's environment rather than an internal implementation. The copy control heads that section rather than trailing it — the label and the way to put it on the clipboard are one thing, and a full-width button below the list spent a row of height restating the same idea. It is a text action with a short visible label ("Copy"), because the section heading already names what is being copied, while its accessible name stays the full "Copy system info".

Licence and source links lead the facts, directly under the intro and above the diagnostics. They are durable project provenance, not part of the product pitch or machine diagnostics, so meeting the project's terms before its machine details keeps the introduction focused. The made-with credit closes the dialog instead, under the diagnostics and the credits it belongs with.

**A dialog that carries a message is not the About dialog.** About is the
product-identity surface — the mascot at hero scale, a 28px name, 30px of
padding — and for a while the open-failure alert and the close-project
confirmation borrowed its shell, which is why a two-line sentence arrived under
a heading sized for a logo. (The shortcut sheet still extends
About's shell on purpose: it is a document to read, not a message to answer.)
Short message dialogs use the same shell as every other dialog in the app
(§ Dialogs, size `s`). Two rules go with them. An error carries a circular
`--status-danger` glyph beside its heading, because a failure should be
recognizable before the sentence is read. And **the constructive choice is the
primary button** — "Turn into a project", not "Close": spending the solid primary
on dismissing a problem tells the user the way out is the way back. When the
message names two ways out ("You can turn it into a project or choose
another"), the dialog offers both, and the other way out takes the dismiss
slot. Dismiss reads first, constructive last, the order every other dialog
uses.
