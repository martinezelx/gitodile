# ADR 0037: Native window chrome and menu bar on macOS

- Status: accepted
- Date: 2026-10-27

## Context

The main window is created without system decorations, and the titlebar draws
its own overflow menu on the left and minimize, maximize and close buttons on
the right. That matches Windows and the default GNOME and KDE layouts, but on
macOS it removed the traffic lights and put a Windows-style button row where no
Mac app has one. macOS also gives every app a menu bar at the top of the
screen, where its users look for About, Settings and Quit, and through which
⌘C, ⌘V and ⌘A reach text fields.

Task [204](../../work/done/0.4.1/204-native-macos-window-chrome.md) compared two
fixes in a mockup: moving the overflow menu to the right of the titlebar, or
moving its entries into the macOS menu bar. Cross-platform desktop apps
(Slack, Spotify, Notion, Claude desktop) take the second route.

## Decision

On macOS only:

- `tauri.macos.conf.json` restores system decorations with an overlay titlebar
  and a hidden title, so macOS draws the traffic lights over GitOdile's own
  titlebar. Tauri merges platform files as a JSON merge patch, which replaces
  arrays whole, so that file repeats the base window; a test keeps the two in
  step.
- The titlebar renders neither the overflow menu nor the custom window buttons
  and reserves the traffic lights' width, except in full screen, where macOS
  hides them.
- The overflow menu's entries move to a native menu bar (GitOdile, File, Edit,
  View, Window, Help) built from the frontend with `@tauri-apps/api/menu`. Its
  labels come from the app's translation tables, its entries call the handlers
  the overflow menu calls, and it is disabled entry by entry under the same
  conditions as the titlebar plus whenever a dialog owns the screen.
- "macOS" is read from `plugin-os` inside Tauri, never from the user agent: a
  browser run on a Mac has no traffic lights and keeps the full titlebar.

Windows and Linux keep the custom titlebar unchanged.

## Consequences

The titlebar now depends on the platform, so DESIGN.md describes both layouts
and the overflow menu and the menu bar must gain new entries together. The menu
needs no new capability: `core:default` already includes the menu commands.

Custom menu entries carry no keyboard shortcut. A macOS key equivalent can fire
next to the webview's keydown handler, and ⌘B toggling twice would cancel
itself; showing ⌘, and ⌘B in the menu waits until it can be qualified on a Mac.
The system items keep their standard shortcuts.

The traffic-light position, the full-screen inset and the menu bar have been
built and unit-tested on Windows only. Under
[ADR 0006](0006-defer-macos-and-linux-runtime-validation.md) they still need
checking on a Mac before macOS packaging is enabled.

## Alternatives considered

- Keep the custom buttons on macOS: functional, but reads as a Windows port and
  leaves the menu bar without About, Settings or a working Edit menu.
- Move the overflow menu to the right of the titlebar: quick and Rust-free, but
  leaves the macOS menu bar nearly empty and Settings away from where Mac users
  expect it.
- Build the menu in Rust: the labels would need a second translation table and
  every entry an event back to the frontend, for no gain over the JavaScript
  menu API.
