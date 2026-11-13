---
id: 204
title: Give macOS its native window controls and menu bar
status: done
priority: normal
type: improvement
areas:
  - frontend
  - desktop
  - ux
created: 2026-10-27
completed: 2026-10-27
parent:
queue:
---

# Goal

Make the window chrome feel native on macOS: the system's traffic lights on
the left, the overflow menu's entries in the macOS menu bar, and no
Windows-style window buttons. Windows and Linux keep today's titlebar.

# User outcome

A Mac user closes, minimizes and zooms the window with the controls they use
in every other app, finds About, Settings, Quit and the project actions in the
menu bar at the top of the screen, and can copy and paste with ⌘C and ⌘V in
every text field.

# Context

The window is created with `decorations: false` on every platform, and the
titlebar draws its own minimize, maximize and close buttons on the right, so
on macOS GitOdile showed no traffic lights and looked like a Windows app. The
user reviewed a private mockup on 2026-10-27 comparing today's titlebar with
two macOS options (the overflow menu moved to the right, or a native menu bar)
and chose the native menu bar, the pattern Slack, Spotify, Notion and Claude
desktop follow on macOS.

Relevant rules: [DESIGN.md](../../../DESIGN.md) § Layout concept (Top bar),
[ADR 0006](../../../docs/adr/0006-defer-macos-and-linux-runtime-validation.md)
(macOS runtime validation is deferred), and AGENTS.md (keep Tauri
capabilities minimal).

# Scope

- macOS window: system decorations with an overlay titlebar, a hidden title
  and the traffic lights centred on the 44px titlebar. Windows and Linux keep
  `decorations: false`.
- macOS titlebar: no overflow menu and no custom window buttons; a lead inset
  that clears the traffic lights, removed in full screen where macOS hides
  them.
- A native macOS menu bar built from the same actions as the overflow menu,
  plus the standard GitOdile, Edit and Window items, localized and kept in
  step with what the app can do at that moment.
- DESIGN.md and an ADR for the platform-specific titlebar.

# Out of scope

- Linux button placement from the desktop environment's settings.
- Showing shortcut labels on custom menu entries (see Decisions).
- A help-menu search field, a Dock menu, or a menu bar on Windows and Linux.
- Enabling macOS packaging.

# Acceptance criteria

- [x] On Windows and Linux the window configuration and titlebar are unchanged.
- [x] `tauri.macos.conf.json` gives the main window system decorations with an
      overlay titlebar, hidden title and traffic-light position, repeating
      every other field of the base window (platform files replace arrays).
- [x] When the app runs on macOS inside Tauri, the titlebar renders neither the
      overflow menu nor the window buttons and reserves the traffic lights'
      width; in a plain browser on a Mac it keeps the full titlebar.
- [x] The macOS menu bar holds every overflow-menu entry, with Close project,
      Open project, Reload window, Back and Forward disabled whenever the
      overflow menu or the titlebar would disable or hide them, and every
      custom entry disabled while a dialog owns the screen.
- [x] The menu bar follows the interface language without a restart.
- [x] Tests cover the menu plan, the state updates and the macOS titlebar.
- [x] DESIGN.md, an ADR and the aggregate gate pass.

# Relevant files

- `src-tauri/tauri.macos.conf.json`
- `src/app/App.tsx`, `src/app/app-shell.css`, `src/app/translations.ts`
- `src/app/nativeAppMenu.ts`, `src/app/nativeAppMenuAdapter.ts` (new)
- `DESIGN.md`, `docs/adr/`

# Dependencies

None.

# Decisions

- The menu is built from the frontend with `@tauri-apps/api/menu`, not in
  Rust: its labels come from the existing translation tables and it rebuilds on
  a language change, and its entries call the same handlers the overflow menu
  does. `core:default` already grants the menu commands, so no capability
  changes.
- Platform comes from `plugin-os`, not the user agent: the overlay titlebar
  exists only in the Tauri macOS build, so a browser run on a Mac must keep the
  custom controls.
- Custom entries carry no accelerator. On macOS a menu key equivalent can fire
  alongside the webview's own keydown handler, and ⌘B toggling twice would undo
  itself. The shortcuts stay owned by the app's keyboard handler until they can
  be qualified on a Mac. The system items (Quit, Hide, Close Window, Minimize,
  Edit) keep their standard shortcuts.
- About opens GitOdile's own dialog rather than the system About panel, so the
  same About appears on every platform.

# Implementation notes

- Window: `tauri.macos.conf.json` repeats the base window with
  `decorations: true`, `titleBarStyle: "Overlay"`, `hiddenTitle: true` and the
  traffic lights at (16, 15), centred on the 44px titlebar.
  `src/architecture/macosWindowConfig.test.ts` keeps it in step with the base.
- Menu: `planAppMenu` in `src/app/nativeAppMenu.ts` is a pure plan of six
  sections; `useNativeAppMenu` installs it once per shape (language) and
  updates text and enabled state in place, chaining calls so an update never
  reaches a menu that is being replaced. `nativeAppMenuAdapter.ts` builds it
  with `@tauri-apps/api/menu` and only touches entries whose text or state
  changed.
- Composition root: `hasNativeMacWindowChrome()` is read once;
  `runAppMenuCommand` calls the overflow menu's handlers and re-checks for an
  open dialog. The titlebar drops `TitlebarMenu` and `.window-controls` on
  macOS, and `.app-window--mac-traffic-lights` reserves 80px on the left
  outside full screen.
- Review pass before completion: read the whole diff. Fixed a handler leak
  into the replacement menu: Tauri unregisters a menu item's click channel by
  id when the item is dropped, and the first version gave every install the
  same ids, so dropping the menu replaced on a language change (or the
  StrictMode double install in development) could silence the new entries.
  Items now take Tauri's generated ids. Also: the composition root plans the
  menu once per render and `runAppMenuCommand` re-checks that plan on click
  (`isAppMenuCommandEnabled`), since the native menu trails the app by an
  asynchronous update; the hook skips serializing the plan on platforms with
  no native menu.
- Not done on purpose: shortcut labels on custom entries (see Decisions). The
  development-only account mock is no longer in the titlebar on macOS; it
  stays reachable from the rail.

# Validation

- `CARGO_TARGET_DIR=<scratch> VITEST_MAX_WORKERS=4 pnpm run check`: exit 0 —
  documentation (347 Markdown files, 254 task ids), architecture (647
  modules), TypeScript, 158 files / 1,743 frontend tests, production build,
  `cargo fmt`, Clippy, 642 Rust library tests (one existing ignored) and 2
  integration tests.
- Not validated on a Mac: the traffic-light position, the full-screen inset,
  the menu bar's appearance and its entries running, and Edit-menu copy and
  paste. These remain open under ADR 0006 before macOS packaging is enabled.
