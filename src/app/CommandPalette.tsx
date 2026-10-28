import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CircleArrowUp,
  CloudDownload,
  FileDiff,
  FolderGit2,
  FolderOpen,
  FolderPlus,
  FolderX,
  GitBranch,
  GitBranchPlus,
  History,
  House,
  Info,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  Monitor,
  Moon,
  RotateCw,
  Settings,
  Sparkles,
  Split,
  SquareTerminal,
  Sun,
} from "lucide-react";
import { useLanguage, type Translations } from "../i18n";
import { autoHideScrollbarProps } from "../shared/ui/autoHideScrollbar";

export type AppCommand = {
  id: string;
  label: string;
  /** The section the command is listed under: a long list groups by what the
   * commands are for, the way the palette's own sections do. */
  group: string;
  /** The glyph the menus already use for the same action, so an entry reads
   * the same wherever it appears. */
  icon: React.ReactNode;
  /** A shortcut spelled at the row's end, when it has one. */
  hint?: string;
  action: () => void;
};

/** What a caller knows about a command: what it does and what it is called.
 * Its section and glyph are the palette's own presentation (`paletteMeta`). */
export type AppCommandDraft = Omit<AppCommand, "group" | "icon">;

/** One glyph per destination, the one the rail gives the same screen: two
 * screens sharing one made their rows indistinguishable at a glance. */
const DESTINATION_ICONS: Record<string, React.ReactNode> = {
  home: <House aria-hidden="true" />,
  overview: <LayoutDashboard aria-hidden="true" />,
  workbench: <Layers aria-hidden="true" />,
  changes: <FileDiff aria-hidden="true" />,
  history: <History aria-hidden="true" />,
  "branches": <GitBranch aria-hidden="true" />,
  console: <SquareTerminal aria-hidden="true" />,
  conflicts: <Split aria-hidden="true" />,
  recovery: <LifeBuoy aria-hidden="true" />,
};

/** A command's section and glyph, by its id: the palette's own presentation,
 * kept out of the callers that only know what a command does. */
export function paletteMeta(id: string, t: Translations): Pick<AppCommand, "group" | "icon"> {
  if (id.startsWith("go-")) {
    const destination = id.slice(3);
    return { group: t.paletteGroupGo, icon: DESTINATION_ICONS[destination] ?? <GitBranch aria-hidden="true" /> };
  }
  if (id.startsWith("open-settings")) return { group: t.paletteGroupGo, icon: <Settings aria-hidden="true" /> };
  if (id.startsWith("switch-")) return { group: t.paletteGroupProject, icon: <FolderGit2 aria-hidden="true" /> };
  if (id.startsWith("theme-")) {
    return {
      group: t.paletteGroupTheme,
      icon: id === "theme-system" ? <Monitor aria-hidden="true" /> : id === "theme-light" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />,
    };
  }
  if (id.startsWith("check-") || id.startsWith("refresh-")) {
    return {
      group: t.paletteGroupRefresh,
      icon: id === "check-remote-changes" ? <CloudDownload aria-hidden="true" /> : id === "check-app-updates" ? <CircleArrowUp aria-hidden="true" /> : <RotateCw aria-hidden="true" />,
    };
  }
  switch (id) {
    case "open-project":
      return { group: t.paletteGroupProject, icon: <FolderOpen aria-hidden="true" /> };
    case "clone-project":
      return { group: t.paletteGroupProject, icon: <CloudDownload aria-hidden="true" /> };
    case "create-project":
      return { group: t.paletteGroupProject, icon: <FolderPlus aria-hidden="true" /> };
    case "close-project":
      return { group: t.paletteGroupProject, icon: <FolderX aria-hidden="true" /> };
    case "new-branch":
      return { group: t.paletteGroupProject, icon: <GitBranchPlus aria-hidden="true" /> };
    case "project-settings":
      return { group: t.paletteGroupProject, icon: <Settings aria-hidden="true" /> };
    case "changelog":
      return { group: t.paletteGroupApp, icon: <Sparkles aria-hidden="true" /> };
    default:
      return { group: t.paletteGroupApp, icon: <Info aria-hidden="true" /> };
  }
}

/** The matches in the order the panel draws them: grouped by section, each
 * section where its first command appears. The selection is an index into
 * this list, so it must be the drawn order — a section that recurs further
 * down (a screen's own command filed under Project among the Go entries)
 * would otherwise leave the highlighted row and the one Enter runs apart. */
export function filterAppCommands(commands: readonly AppCommand[], query: string): AppCommand[] {
  const needle = query.trim().toLowerCase();
  const matches = commands.filter((command) => needle === "" || command.label.toLowerCase().includes(needle));
  return groupAppCommands(matches).flatMap((group) => group.commands);
}

export type CommandGroup = { name: string; commands: AppCommand[] };

/** Sections in the order they first appear, so a group's own order is the
 * caller's and nothing is listed twice under two headings. */
export function groupAppCommands(commands: readonly AppCommand[]): CommandGroup[] {
  const order: string[] = [];
  const grouped = new Map<string, AppCommand[]>();
  for (const command of commands) {
    if (!grouped.has(command.group)) {
      grouped.set(command.group, []);
      order.push(command.group);
    }
    grouped.get(command.group)?.push(command);
  }
  return order.map((name) => ({ name, commands: grouped.get(name) ?? [] }));
}

/** A little past the 90ms `palette-rise-out` and `palette-unfold-out`, so a
 * busy frame never cuts the last one. The panel keeps the last results on
 * screen for this long, and the field keeps its open shape with it. */
const EXIT_MS = 120;

/** How far the panel's centre may sit from the window's edges. */
const PANEL_EDGE = 12;

/** The panel's measure, mirrored from `app-shell.css`'
 * `min(480px, calc(100vw - 48px))`: the deployment needs it before the panel
 * paints, and a test's DOM reports a stubbed box for every element. */
const PANEL_WIDTH = 480;
const PANEL_VIEWPORT_MARGIN = 48;
/** The narrowest field the results can grow out of. Below it a row's name
 * and its shortcut no longer share a line, so the panel floats instead. */
const FUSED_MIN_WIDTH = 320;

/** Where the panel's centre can sit: on the field's centre when the window has
 * room, pulled inside its edges when the field sits near one — Console's field
 * is at the left of its status line, and a narrow window can put the strip's
 * field near an edge too. A panel as wide as the window simply stays centred. */
export function clampPaletteLeft(center: number, panelWidth: number, viewportWidth: number): number {
  if (panelWidth <= 0) return center;
  const half = panelWidth / 2;
  const min = Math.min(half + PANEL_EDGE, viewportWidth / 2);
  const max = Math.max(viewportWidth - half - PANEL_EDGE, viewportWidth / 2);
  return Math.min(Math.max(center, min), max);
}

/**
 * The results of the app's search, deployed from the field that asked for
 * them: the strip's own control holds the query and the keyboard, and this
 * surface only shows what matches — grouped, with the glyph each action
 * already wears, and the keys it answers to at its foot.
 */
export function CommandPalette({
  isOpen,
  matches,
  selectedIndex,
  anchorRef,
  reducedMotion = false,
  leaveAtOnce = false,
  variant = "app",
  fitToField = false,
  onSelect,
  onHover,
}: {
  isOpen: boolean;
  /** Already filtered and in the field's order, so the input's
   * `aria-activedescendant` and this list cannot disagree. */
  matches: readonly AppCommand[];
  selectedIndex: number;
  /** The field. The results sit centred on it, eight pixels above it. */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** The app preference. With motion off the panel closes at once instead of
   * holding a frame it is not animating; the system preference only calms the
   * motion to a fade, in CSS. */
  reducedMotion?: boolean;
  /** The chosen command changes the screen or the project. The results and
   * the field's open shape go at once: a fold back into the field while the
   * next screen draws reads as a stray animation of its own. */
  leaveAtOnce?: boolean;
  /** Which material the results wear: the app's raised card, or the console's
   * own pane when the field belongs to the Console. */
  variant?: "app" | "console";
  /** Grow out of the field as one object (DESIGN.md § Status bar): the panel
   * takes the field's width and sits on its top edge, and the open field
   * becomes the object's foot. A field too narrow to carry the results (see
   * `FUSED_MIN_WIDTH`) gets a floating panel of its own instead. */
  fitToField?: boolean;
  onSelect: (command: AppCommand) => void;
  onHover: (index: number) => void;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const [anchor, setAnchor] = useState<{ left: number; bottom: number; width?: number; fused?: boolean; radius?: number } | null>(null);
  // Closing keeps the panel mounted for the leaving animation, holding the
  // last results and the surface it opened with, so a destination that changes
  // screens cannot flash the other material while the panel fades.
  const [phase, setPhase] = useState<"closed" | "open" | "closing">(isOpen ? "open" : "closed");
  const [held, setHeld] = useState<{ matches: readonly AppCommand[]; selectedIndex: number; variant: "app" | "console" }>({
    matches,
    selectedIndex,
    variant,
  });
  const listRef = useRef<HTMLUListElement>(null);
  // Set when the panel leaves at once, so the field drops its open shape
  // without easing its corners back either.
  const snapRef = useRef(false);
  // The field that wears the panel's phase, so the phase comes off the same
  // element it was put on.
  const stateFieldRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (isOpen) {
      setPhase("open");
      return;
    }
    // The system preference still leaves through `closing`: there the panel
    // fades without moving (app-shell.css), rather than vanishing.
    setPhase((current) => {
      if (current !== "open") return current;
      if (reducedMotion || leaveAtOnce) {
        snapRef.current = leaveAtOnce;
        return "closed";
      }
      return "closing";
    });
  }, [isOpen, reducedMotion, leaveAtOnce]);

  useEffect(() => {
    if (isOpen) setHeld({ matches, selectedIndex, variant });
  }, [isOpen, matches, selectedIndex, variant]);

  useEffect(() => {
    if (phase !== "closing") return;
    const timer = window.setTimeout(() => setPhase("closed"), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // The field wears the panel's phase, not the caller's `isOpen`, so it stays
  // the object's foot until the panel has folded back into it. Dropping its
  // open shape on the first frame of the close left the panel fading square
  // over a pill.
  useLayoutEffect(() => {
    if (phase !== "closed") {
      const element = anchorRef.current;
      const field = fitToField ? (element?.closest<HTMLElement>("[data-palette-field]") ?? element) : null;
      if (stateFieldRef.current && stateFieldRef.current !== field) delete stateFieldRef.current.dataset.paletteState;
      stateFieldRef.current = field;
      if (!field) return;
      field.dataset.paletteState = phase;
      return;
    }
    // Cleared on the field it was written to: a command that changes screens
    // may have moved the anchor to another screen's field by now.
    const field = stateFieldRef.current;
    stateFieldRef.current = null;
    if (!field) return;
    delete field.dataset.paletteState;
    if (!snapRef.current) return;
    snapRef.current = false;
    // Transitions off for the frame the open shape goes, back on after it.
    field.dataset.paletteSnap = "";
    const frame = window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => delete field.dataset.paletteSnap),
    );
    return () => {
      window.cancelAnimationFrame(frame);
      delete field.dataset.paletteSnap;
    };
  }, [phase, anchorRef, fitToField]);

  // The list follows the chosen row: the arrows can walk past the panel's
  // 300px of results, and the row the field points at must stay in view.
  // `scrollIntoView` is missing in a test's DOM; the call is optional for it.
  useLayoutEffect(() => {
    if (phase !== "open") return;
    const selected = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    selected?.scrollIntoView?.({ block: "nearest" });
  }, [phase, held.matches, held.selectedIndex]);

  // Measured before the first paint, so the panel never draws at the window's
  // centre and then jumps to the field — that jump is what read as a flicker.
  // Re-measured on resize; a frame the browser has not laid out (a test) simply
  // renders the panel unpositioned, where a role query still finds it.
  useLayoutEffect(() => {
    if (phase === "closed") {
      setAnchor(null);
      return;
    }
    const measure = (): void => {
      const element = anchorRef.current;
      if (!element) {
        // No field to hang from — the screen's field has not mounted yet, as
        // while its chunk loads. The results still open, at the foot of the
        // window, so the shortcut never goes dead; Esc closes it from the
        // document handler while nothing here owns the keyboard.
        setAnchor({ left: window.innerWidth / 2, bottom: 96 });
        return;
      }
      // Fitted, the panel matches the whole field — its glyph included — not
      // only the input inside it.
      const field = fitToField ? (element.closest("[data-palette-field]") ?? element) : element;
      const rect = field.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setAnchor(null);
        return;
      }
      const center = rect.left + rect.width / 2;
      const roomy = Math.max(window.innerWidth - PANEL_VIEWPORT_MARGIN, 0);
      const fused = fitToField && rect.width >= FUSED_MIN_WIDTH;
      const panelWidth = fused
        ? rect.width
        : fitToField
          ? Math.min(Math.max(rect.width, FUSED_MIN_WIDTH), roomy)
          : Math.min(PANEL_WIDTH, roomy);
      // The field learns whether it is the object's foot, so its open state
      // can join the panel or stay a field of its own.
      if (fused) field.setAttribute("data-palette-fused", "");
      else field.removeAttribute("data-palette-fused");
      // Fused, the panel's top corners are the field's own: half its height,
      // so the object is one shape whatever field it grew out of.
      setAnchor({
        left: clampPaletteLeft(center, panelWidth, window.innerWidth),
        bottom: window.innerHeight - rect.top + (fused ? 0 : 8),
        ...(fitToField ? { width: panelWidth, fused } : {}),
        ...(fused ? { radius: rect.height / 2 } : {}),
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [phase, anchorRef, fitToField]);

  if (phase === "closed") return null;

  // While open it wears the surface of the screen that asked; on the way out it
  // keeps the one it opened with, so a destination's screen change cannot flip
  // the material under the fade.
  const surface = phase === "open" ? variant : held.variant;
  const groups = groupAppCommands(held.matches);
  let index = -1;

  return (
    <div
      className={`palette-panel${surface === "console" ? " palette-panel--console" : ""}${anchor?.fused ? " palette-panel--fused" : ""}${anchor?.width ? " palette-panel--fit" : ""}${phase === "closing" ? " palette-panel--closing" : ""}`}
      data-palette-panel=""
      style={
        anchor
          ? ({
              left: `${anchor.left}px`,
              bottom: `${anchor.bottom}px`,
              ...(anchor.width ? { width: `${anchor.width}px` } : {}),
              ...(anchor.radius ? { "--radius-field": `${anchor.radius}px` } : {}),
            } as React.CSSProperties)
          : undefined
      }
    >
      <ul
        {...autoHideScrollbarProps<HTMLUListElement>()}
        ref={listRef}
        className="palette-list auto-hide-scrollbar"
        id="palette-list"
        role="listbox"
        aria-label={t.paletteAriaLabel}
      >
        {held.matches.length === 0 && <li className="empty-line empty-line--menu palette-empty">{t.paletteNoMatches}</li>}
        {groups.map((group) => (
          <React.Fragment key={group.name}>
            <li className="palette-group" role="presentation">
              {group.name}
            </li>
            {group.commands.map((command) => {
              index += 1;
              const position = index;
              return (
                <li
                  key={command.id}
                  id={`palette-option-${command.id}`}
                  role="option"
                  aria-selected={position === held.selectedIndex}
                  className="palette-item"
                  onMouseEnter={() => onHover(position)}
                  onMouseDown={(event) => {
                    // Keeps the field's focus: a press on a result chooses it.
                    event.preventDefault();
                    onSelect(command);
                  }}
                >
                  {command.icon}
                  <span className="palette-item__label">{command.label}</span>
                  {command.hint && <kbd className="palette-item__hint">{command.hint}</kbd>}
                </li>
              );
            })}
          </React.Fragment>
        ))}
      </ul>
      {/* The keys are spelled only on the Console's terminal pane; elsewhere
          the selected row says Enter, and the arrows and Escape are what
          every list already answers to. */}
      {!fitToField && <div className="palette-footer" aria-hidden="true">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> {t.paletteMove}
        </span>
        <span>
          <kbd>↵</kbd> {t.paletteOpen}
        </span>
        <span>
          <kbd>esc</kbd> {t.paletteClose}
        </span>
      </div>}
    </div>
  );
}
