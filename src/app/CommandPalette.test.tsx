import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../i18n";
import {
  CommandPalette,
  clampPaletteLeft,
  filterAppCommands,
  groupAppCommands,
  paletteMeta,
  type AppCommand,
} from "./CommandPalette";

const commands: AppCommand[] = [
  { id: "go-home", label: "Go to Home", group: "Go", icon: null, action: vi.fn() },
  { id: "changelog", label: "What's new", group: "App", icon: null, action: vi.fn() },
];

/** A field the browser has laid out: the panel must read its rect. */
function laidOutAnchor(rect: { left: number; top: number; width: number; height: number }): React.RefObject<HTMLInputElement | null> {
  const element = document.createElement("input");
  element.getBoundingClientRect = () =>
    ({
      x: rect.left,
      y: rect.top,
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
      toJSON: () => ({}),
    }) as DOMRect;
  const ref = React.createRef<HTMLInputElement>();
  ref.current = element;
  return ref;
}

function panel(
  anchorRef: React.RefObject<HTMLElement | null>,
  selectedIndex = 0,
  variant: "app" | "console" = "app",
): React.JSX.Element {
  return (
    <LanguageProvider>
      <CommandPalette
        isOpen
        matches={commands}
        selectedIndex={selectedIndex}
        anchorRef={anchorRef}
        variant={variant}
        onSelect={vi.fn()}
        onHover={vi.fn()}
      />
    </LanguageProvider>
  );
}

function renderPanel(
  anchorRef: React.RefObject<HTMLElement | null>,
  selectedIndex = 0,
  variant: "app" | "console" = "app",
): ReturnType<typeof render> {
  return render(panel(anchorRef, selectedIndex, variant));
}

afterEach(() => cleanup());

describe("CommandPalette deployment", () => {
  it("deploys centred on the field it was opened from, eight pixels above it", () => {
    // A 300px field centred at x=550, with its top 68px above the window's foot.
    renderPanel(laidOutAnchor({ left: 400, top: window.innerHeight - 68, width: 300, height: 32 }));

    const panel = screen.getByRole("listbox", { name: "Command palette" }).parentElement;
    expect(panel).toHaveClass("palette-panel");
    expect(panel).toHaveStyle({ left: "550px", bottom: "76px" });
  });

  it("sits at the foot of the window when there is no field to hang from", () => {
    // A screen whose field has not mounted yet (its chunk is loading) still
    // opens the results, at the window's foot, rather than nowhere.
    renderPanel({ current: null });

    const panel = screen.getByRole("listbox", { name: "Command palette" }).parentElement;
    expect(panel).toHaveStyle({ left: `${window.innerWidth / 2}px`, bottom: "96px" });
  });

  it("pulls the panel inside the window when the field sits near an edge", () => {
    // Console's field is at the left of its status line; a 480px panel centred
    // on it would hang off the window.
    expect(clampPaletteLeft(80, 480, 1024)).toBe(252);
    expect(clampPaletteLeft(1000, 480, 1024)).toBe(772);
    expect(clampPaletteLeft(512, 480, 1024)).toBe(512);
    // A panel as wide as the window stays centred rather than jumping inwards.
    expect(clampPaletteLeft(512, 976, 1024)).toBe(512);
    // Nothing measured (a test's DOM) means nothing to clamp against.
    expect(clampPaletteLeft(80, 0, 1024)).toBe(80);
  });

  it("wears the console pane's material only when the search belongs to Console", () => {
    const anchor = laidOutAnchor({ left: 400, top: 600, width: 300, height: 32 });
    const { rerender } = renderPanel(anchor);
    const panelElement = () => screen.getByRole("listbox", { name: "Command palette" }).parentElement;

    expect(panelElement()).not.toHaveClass("palette-panel--console");

    rerender(panel(anchor, 0, "console"));

    expect(panelElement()).toHaveClass("palette-panel--console");
  });

  it("holds its surface while it leaves, even when the screen has changed", () => {
    const anchor = laidOutAnchor({ left: 400, top: 600, width: 300, height: 32 });
    const { rerender } = renderPanel(anchor, 0, "console");

    rerender(
      <LanguageProvider>
        <CommandPalette
          isOpen={false}
          matches={commands}
          selectedIndex={0}
          anchorRef={anchor}
          variant="app"
          onSelect={vi.fn()}
          onHover={vi.fn()}
        />
      </LanguageProvider>,
    );

    const closing = screen.getByRole("listbox", { name: "Command palette" }).parentElement;
    expect(closing).toHaveClass("palette-panel--closing");
    expect(closing).toHaveClass("palette-panel--console");
  });

  it("leaves with its animation, holding the last results while it fades", async () => {
    const anchor = laidOutAnchor({ left: 400, top: 600, width: 300, height: 32 });
    const { rerender } = renderPanel(anchor);
    expect(screen.getByRole("listbox", { name: "Command palette" })).toBeInTheDocument();

    rerender(
      <LanguageProvider>
        <CommandPalette
          isOpen={false}
          matches={commands}
          selectedIndex={0}
          anchorRef={anchor}
          onSelect={vi.fn()}
          onHover={vi.fn()}
        />
      </LanguageProvider>,
    );

    // Still on screen, wearing the leaving animation and the rows it had.
    const closing = screen.getByRole("listbox", { name: "Command palette" }).parentElement;
    expect(closing).toHaveClass("palette-panel--closing");
    expect(within(closing as HTMLElement).getAllByRole("option")).toHaveLength(2);

    await waitFor(() =>
      expect(screen.queryByRole("listbox", { name: "Command palette" })).not.toBeInTheDocument(),
    );
  });

  it("keeps the chosen result in view as the selection moves", async () => {    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    try {
      const anchor = laidOutAnchor({ left: 400, top: 600, width: 300, height: 32 });
      const { rerender } = renderPanel(anchor);
      scrollIntoView.mockClear();

      rerender(panel(anchor, 1));

      // The held list takes the new index first, then the row is followed.
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" }));
    } finally {
      if (original) {
        Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: original });
      } else {
        delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
      }
    }
  });
});

describe("CommandPalette commands", () => {
  it("filters by label and keeps the caller's order", () => {
    expect(filterAppCommands(commands, "").map((command) => command.id)).toEqual(["go-home", "changelog"]);
    expect(filterAppCommands(commands, "home").map((command) => command.id)).toEqual(["go-home"]);
    // Case- and space-insensitive, like every other search in the app.
    expect(filterAppCommands(commands, "  WHAT'S  ").map((command) => command.id)).toEqual(["changelog"]);
    expect(filterAppCommands(commands, "zzz")).toEqual([]);
  });

  it("returns the matches in the drawn, grouped order, so the selection runs the row it highlights", () => {
    // Branches files its own "New branch" under Project right after the Go
    // entries; drawn grouped, it comes after them — and Enter must agree.
    const mixed = [
      { id: "go-overview", label: "Go to Overview", group: "Go", icon: null, action: vi.fn() },
      { id: "new-branch", label: "New branch", group: "Project", icon: null, action: vi.fn() },
      { id: "go-console", label: "Go to Console", group: "Go", icon: null, action: vi.fn() },
    ];
    expect(filterAppCommands(mixed, "").map((command) => command.id)).toEqual(["go-overview", "go-console", "new-branch"]);
  });

  it("groups consecutive commands under their section, once each", () => {
    const grouped = groupAppCommands([
      { id: "a", label: "A", group: "Go", icon: null, action: vi.fn() },
      { id: "b", label: "B", group: "Go", icon: null, action: vi.fn() },
      { id: "c", label: "C", group: "App", icon: null, action: vi.fn() },
      { id: "d", label: "D", group: "Go", icon: null, action: vi.fn() },
    ]);

    expect(grouped.map((group) => group.name)).toEqual(["Go", "App"]);
    expect(grouped[0].commands.map((command) => command.id)).toEqual(["a", "b", "d"]);
    expect(grouped[1].commands.map((command) => command.id)).toEqual(["c"]);
  });

  it("gives each command its section and glyph by id", () => {
    const t = {
      paletteGroupGo: "Go",
      paletteGroupProject: "Project",
      paletteGroupRefresh: "Refresh",
      paletteGroupTheme: "Theme",
      paletteGroupApp: "App",
    } as Parameters<typeof paletteMeta>[1];

    expect(paletteMeta("go-home", t).group).toBe("Go");
    expect(paletteMeta("switch-abc", t).group).toBe("Project");
    expect(paletteMeta("check-remote-changes", t).group).toBe("Refresh");
    expect(paletteMeta("theme-dark", t).group).toBe("Theme");
    expect(paletteMeta("changelog", t).group).toBe("App");
    expect(paletteMeta("go-home", t).icon).not.toBeNull();
  });

  it("gives every destination a glyph of its own", () => {
    const t = { paletteGroupGo: "Go" } as Parameters<typeof paletteMeta>[1];
    const destinations = ["home", "overview", "workbench", "changes", "history", "branches", "console", "conflicts", "recovery"];
    const glyphs = destinations.map((destination) => (paletteMeta(`go-${destination}`, t).icon as React.ReactElement).type);

    expect(new Set(glyphs).size).toBe(destinations.length);
  });
});

describe("CommandPalette grown out of its field", () => {
  /** The strip's field: the input inside the element that carries
   * `data-palette-field`, which is what a fitted panel measures. */
  function fittedField(): { field: HTMLElement; anchor: React.RefObject<HTMLInputElement | null> } {
    const field = document.createElement("div");
    field.setAttribute("data-palette-field", "");
    const input = laidOutAnchor({ left: 300, top: 600, width: 400, height: 32 });
    field.getBoundingClientRect = () => (input.current as HTMLInputElement).getBoundingClientRect();
    field.appendChild(input.current as HTMLInputElement);
    return { field, anchor: input };
  }

  function fitted(anchor: React.RefObject<HTMLInputElement | null>, isOpen: boolean, leaveAtOnce = false): React.JSX.Element {
    return (
      <LanguageProvider>
        <CommandPalette
          isOpen={isOpen}
          matches={commands}
          selectedIndex={0}
          anchorRef={anchor}
          leaveAtOnce={leaveAtOnce}
          fitToField
          onSelect={vi.fn()}
          onHover={vi.fn()}
        />
      </LanguageProvider>
    );
  }

  it("shares the field's corners and keeps the field open until it has folded back", async () => {
    const { field, anchor } = fittedField();
    const { rerender } = render(fitted(anchor, true));

    const fused = screen.getByRole("listbox", { name: "Command palette" }).parentElement as HTMLElement;
    expect(fused).toHaveClass("palette-panel--fused");
    expect(fused.style.getPropertyValue("--radius-field")).toBe("16px");
    expect(field).toHaveAttribute("data-palette-fused");
    expect(field.dataset.paletteState).toBe("open");

    rerender(fitted(anchor, false));

    // The caller has closed it, but the field stays the panel's foot while
    // the panel folds back into it.
    expect(field.dataset.paletteState).toBe("closing");
    await waitFor(() =>
      expect(screen.queryByRole("listbox", { name: "Command palette" })).not.toBeInTheDocument(),
    );
    expect(field).not.toHaveAttribute("data-palette-state");
  });

  it("leaves at once, field and all, when the command changes the screen", () => {
    const { field, anchor } = fittedField();
    const { rerender } = render(fitted(anchor, true));

    rerender(fitted(anchor, false, true));

    // No fold back while the next screen draws: the panel is gone, and the
    // field drops its open shape without easing its corners back.
    expect(screen.queryByRole("listbox", { name: "Command palette" })).not.toBeInTheDocument();
    expect(field).not.toHaveAttribute("data-palette-state");
    expect(field).toHaveAttribute("data-palette-snap");
  });
});
