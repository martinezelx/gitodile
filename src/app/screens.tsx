import React, { Profiler, useEffect, useLayoutEffect, useRef } from "react";
import { LifeBuoy } from "lucide-react";
import { homeScreenModule, HomeScreen } from "../features/home";

import { ChangesPanel } from "../features/changes";
import { consoleScreenModule, ConsoleScreen } from "../features/console";
import { overviewScreenModule, OverviewPanel } from "../features/overview";
import { HistoryScreen } from "../features/history";
import { settingsOverlayModule } from "../features/settings";
import { branchesScreenModule, BranchesScreen } from "../features/branches";
import { workbenchScreenModule, WorkbenchScreen } from "../features/workbench";
import { conflictsScreenModule, ConflictsScreen } from "../features/conflicts";
import { useLanguage } from "../i18n";
import { ErrorBoundary, ViewErrorNotice } from "../shared/ui";
import type { ProjectView } from "../runtime/project/sessions";
import {
  ScreenLifecycleProvider,
  createScreenLifecycleController,
  defineScreenModules,
  type ScreenModule,
  type TextKey,
} from "../runtime/screen/module";

/** Every workspace screen the app can show. Settings is an app-level dialog,
 * not a screen, so opening it never changes a project's navigation history. */
export type ScreenId = ProjectView | "home";

/** Nav destinations include screens that do not exist yet (currently
 * Recovery). They live in the same table so a destination cannot be
 * half-registered when it becomes a real screen. */
export type NavDestinationId = ScreenId | "recovery" | "settings";

/** Keys of `Translations` whose value is a plain string, so a registry entry
 * can name a label without being able to point at a formatting function. */
export type NavDestination = {
  id: NavDestinationId;
  /** `null` for a destination that is announced but not built yet. Anything
   * with a screen id is mounted and kept alive by `KeepAliveScreens`. */
  screen: ScreenId | null;
  /** Which sidebar `<nav>` the entry belongs to. */
  section: "project" | "application";
  labelKey: TextKey;
  /** The line Navigation Settings shows under the label; `null` for an entry
   * that is not in the rail. */
  descriptionKey: TextKey | null;
  /** Tooltip and accessible name while the entry is disabled — it has to
   * explain *why* it is disabled, per AGENTS.md's "never hide consequences". */
  disabledLabelKey: TextKey | null;
  icon: React.JSX.Element;
  /** Disabled until a project is open, and left automatically if the project
   * closes while the screen is showing. */
  requiresProject: boolean;
  /** Narrow windows show a reduced nav; `false` keeps an entry out of it. */
  inCompactNav: boolean;
  inRail: boolean;
  /** Command palette label, or `null` to stay out of the palette. */
  commandLabelKey: TextKey | null;
  /** Chunks this destination needs, warmed during idle after first paint so
   * the first visit is a cache hit rather than a fetch (task 018's rule).
   * Listing them per destination rather than in one flat list is what stops a
   * new screen from silently shipping without a prefetch, which is exactly
   * what happened to the Branches chunks between tasks 016 and 019. */
  prefetch: (() => Promise<unknown>)[];
  /** App-level overlay opened without replacing the active workspace. */
  overlay?: "settings";
};

export { ChangesPanel, ConflictsScreen, ConsoleScreen, HistoryScreen, HomeScreen, OverviewPanel, BranchesScreen, WorkbenchScreen };

/** The single place a screen is registered. Nav (expanded and compact), the
 * command palette, idle prefetching, the "leave if the project closed" guard,
 * and the keep-alive host all derive from this array — adding a screen means
 * adding an entry here and a component, and nothing else. Order is the order
 * the sidebar shows.
 *
 * Work is what has changed and what has been saved — one loop, one screen,
 * with Changes and History as its two tabs (task 126; they were neighbouring
 * screens before that). Branches follows: switching a branch is a
 * deliberate move between pieces of work, not part of that loop. The order
 * here is only the default; Navigation Settings still lets anyone rearrange
 * the rail. */
export const SCREEN_MODULES = defineScreenModules([
  homeScreenModule,
  overviewScreenModule,
  workbenchScreenModule,
  branchesScreenModule,
  consoleScreenModule,
  conflictsScreenModule,
  {
    kind: "placeholder",
    id: "recovery",
    section: "project",
    labelKey: "navRecovery",
    descriptionKey: "navRecoveryDescription",
    disabledLabelKey: "navRecoveryTitle",
    icon: <LifeBuoy />,
    requiresProject: true,
    inCompactNav: false,
  },
  settingsOverlayModule,
] as const satisfies readonly ScreenModule[]);

/** Compatibility-shaped navigation view. It is derived from the functional
 * module descriptors, never authored separately. */
export const NAV_DESTINATIONS: readonly NavDestination[] = SCREEN_MODULES.map((module) => {
  if (module.kind === "screen") {
    return {
      id: module.id as ScreenId,
      screen: module.id as ScreenId,
      section: module.section,
      labelKey: module.labelKey,
      descriptionKey: module.descriptionKey,
      disabledLabelKey: module.disabledLabelKey,
      icon: module.icon,
      requiresProject: module.requiresProject,
      inCompactNav: module.inCompactNav,
      inRail: !("inRail" in module && module.inRail === false),
      commandLabelKey: module.commandLabelKey,
      prefetch: [],
    };
  }
  if (module.kind === "overlay") {
    return {
      id: module.id as NavDestinationId,
      screen: null,
      section: module.section,
      labelKey: module.labelKey,
      descriptionKey: null,
      disabledLabelKey: null,
      icon: module.icon,
      requiresProject: false,
      inCompactNav: module.inCompactNav,
      inRail: true,
      commandLabelKey: module.commandLabelKey,
      prefetch: [],
      overlay: module.overlay,
    };
  }
  return {
    id: module.id as NavDestinationId,
    screen: null,
    section: module.section,
    labelKey: module.labelKey,
    descriptionKey: module.descriptionKey,
    disabledLabelKey: module.disabledLabelKey,
    icon: module.icon,
    requiresProject: module.requiresProject,
    inCompactNav: module.inCompactNav,
    inRail: true,
    commandLabelKey: null,
    prefetch: [],
  };
});

type RegisteredFunctionalModule = Extract<(typeof SCREEN_MODULES)[number], { kind: "screen" }>;
const FUNCTIONAL_SCREEN_MODULES = SCREEN_MODULES.filter(
  (module): module is RegisteredFunctionalModule => module.kind === "screen",
);

/** Screen ids in nav order, which is also the DOM order the keep-alive host
 * mounts them in. */
export const SCREEN_ORDER: ScreenId[] = FUNCTIONAL_SCREEN_MODULES.map((module) => module.id as ScreenId);

const APPLICATION_SESSION_SCREENS = new Set<ScreenId>(
  FUNCTIONAL_SCREEN_MODULES.flatMap((module) =>
    module.lifecycle.evict === "application-session" ? [module.id as ScreenId] : [],
  ),
);

const SCREENS_REQUIRING_PROJECT = new Set<ScreenId>(
  NAV_DESTINATIONS.flatMap((destination) =>
    destination.screen && destination.requiresProject ? [destination.screen] : [],
  ),
);

export function screenRequiresProject(screen: ScreenId): boolean {
  return SCREENS_REQUIRING_PROJECT.has(screen);
}

/** Warms every registered destination's chunks. Called from an idle callback
 * after first paint — never before it, which would defeat the code splitting
 * this exists to compensate for. */
export function prefetchScreenChunks(): Promise<unknown> {
  const loads: Promise<unknown>[] = [];
  for (const module of FUNCTIONAL_SCREEN_MODULES) {
    if (!("kind" in module.container)) {
      loads.push(module.container.preload());
    }
    for (const load of module.additionalPreloads) {
      loads.push(load());
    }
  }
  return Promise.all(loads);
}

/** Development builds only, and never under the test runner. Excluded from
 * production bundles by the `import.meta.env` checks, which Vite resolves
 * statically. Profiling is opt-in because React's Profiler and per-switch
 * logging both add work to the interaction they measure. Run with
 * `VITE_PROFILE_SCREEN_SWITCHES=true pnpm tauri dev` to collect numbers. */
const MEASURE_SWITCHES =
  import.meta.env.DEV &&
  import.meta.env.MODE !== "test" &&
  import.meta.env.VITE_PROFILE_SCREEN_SWITCHES === "true";

/** State of the switch currently being measured. Module-level because the
 * click, the commit, and the painted frame happen in three different places. */
let switchIntentAt: number | null = null;
let switchFrom: ScreenId | null = null;
let switchTo: ScreenId | null = null;
/** Set by the inner profiler, read by the outer one. React fires nested
 * `onRender` callbacks child-first, so this is always the current commit's
 * value by the time the app-level report runs. */
let screensRenderMs = 0;

export function markScreenSwitchIntent(from: ScreenId, to: ScreenId): void {
  if (MEASURE_SWITCHES) {
    switchIntentAt = performance.now();
    switchFrom = from;
    switchTo = to;
  }
}

/** Breaks a screen switch into the costs that are easily confused for each
 * other, because guessing which one dominates has already been wrong twice:
 *
 * - `app` — React rendering the whole tree for this commit. Switching screens
 *   re-renders `App` itself: sidebar, project switcher, palette command list,
 *   dialog wrappers. That work is the same size whichever screen you land on,
 *   which is what a cost that does not scale with the screen looks like.
 * - `screens` — the part of `app` spent inside the screen host, so the two
 *   together say whether the cost is the screen or everything around it.
 * - `paint` — from the commit to the browser having painted the next frame:
 *   style, layout, and paint.
 * - `total` — from the click to that painted frame. Anything outside React's
 *   render (event handling, effects, forced reflow, waiting on IPC) shows up
 *   as the gap between `total` and the rest.
 *
 * Wrap the whole app in this, not just the screens — measuring only the screen
 * subtree is what hid the constant per-switch cost in the first place.
 *
 * Run `pnpm tauri dev`, switch screens, and read the console. Long animation
 * frames are logged too where the engine supports the API, which attributes a
 * slow frame to script vs. style-and-layout. */
export function SwitchMeasurementRoot({ children }: { children: React.ReactNode }): React.JSX.Element {
  useEffect(() => {
    if (!MEASURE_SWITCHES || !("PerformanceObserver" in window)) {
      return undefined;
    }
    if (!PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) {
      return undefined;
    }
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const frame = entry as PerformanceEntry & { renderStart?: number; styleAndLayoutStart?: number };
        const script = frame.renderStart ? frame.renderStart - frame.startTime : 0;
        const render = frame.styleAndLayoutStart && frame.renderStart ? frame.styleAndLayoutStart - frame.renderStart : 0;
        const styleAndLayout = frame.styleAndLayoutStart
          ? frame.startTime + frame.duration - frame.styleAndLayoutStart
          : 0;
        console.info(
          `[screens] long frame ${frame.duration.toFixed(0)}ms — script ${script.toFixed(0)}ms, ` +
            `render ${render.toFixed(0)}ms, style+layout ${styleAndLayout.toFixed(0)}ms`,
        );
      }
    });
    observer.observe({ type: "long-animation-frame", buffered: true });
    return () => observer.disconnect();
  }, []);

  if (!MEASURE_SWITCHES) {
    return <>{children}</>;
  }

  return (
    <Profiler
      id="app"
      onRender={(_id, _phase, actualDuration) => {
        if (switchIntentAt === null) {
          return;
        }
        const clickedAt = switchIntentAt;
        const from = switchFrom;
        const to = switchTo;
        switchIntentAt = null;
        const committedAt = performance.now();
        const appMs = actualDuration;
        const screensMs = screensRenderMs;
        let reported = false;
        const report = (paintedAt: number | null): void => {
          if (reported) {
            return;
          }
          reported = true;
          const nodes = document.querySelectorAll(".screen-slot:not([hidden]) *").length;
          const paint = paintedAt === null ? "n/a" : `${(paintedAt - committedAt).toFixed(1)}ms`;
          const total = paintedAt === null ? "n/a" : `${(paintedAt - clickedAt).toFixed(1)}ms`;
          console.info(
            `[screens] ${from} → ${to}: app ${appMs.toFixed(1)}ms (screens ${screensMs.toFixed(1)}ms), ` +
              `paint ${paint}, total ${total}, ${nodes} nodes`,
          );
        };
        // Two frames: the first is the one this commit paints in, the second
        // guarantees the browser has finished it. The timeout is the fallback
        // for a window that is not compositing (minimised, or a headless
        // preview), where no frame is produced and paint is unavailable.
        requestAnimationFrame(() => requestAnimationFrame(() => report(performance.now())));
        setTimeout(() => report(null), 500);
      }}
    >
      {children}
    </Profiler>
  );
}

/** Keeps every visited screen mounted and hides the inactive ones, instead of
 * unmounting on navigation.
 *
 * Why: the caches from task 019 made screen data instant, but each switch
 * still rebuilt the screen's DOM from scratch — for Changes that means the
 * whole file list plus a virtualizer remount whose rows measure themselves on
 * first render. Not unmounting is a property this host provides once, rather
 * than an optimisation every future screen has to repeat.
 *
 * Three details carry the behaviour:
 *
 * - **Mount on first visit, not eagerly.** A screen the user never opens costs
 *   nothing, so the first-paint work task 018 protected is untouched.
 * - **Inactive screens are frozen.** Their element from the last time they were
 *   active is re-rendered by identity, so React bails out of that subtree and
 *   an unrelated `App` state change cannot re-render a screen nobody is
 *   looking at. They pick up current props on the frame they become active
 *   again.
 * - **Hidden means gone.** `hidden` plus `inert` keeps an inactive screen out
 *   of the tab order, out of the accessibility tree, and unable to announce
 *   status updates from behind the visible one.
 *
 * Project screens use the active session epoch in their key, so leaving a
 * project evicts its local state. Application screens such as Home retain a
 * stable key across project switches. */
export function KeepAliveScreens({
  active,
  screens,
  projectEpoch,
}: {
  active: ScreenId;
  projectEpoch?: string | null;
  /** The screens available right now. A screen missing from this record (a
   * project-only screen with no project open) is dropped rather than kept
   * alive. */
  screens: Partial<Record<ScreenId, React.ReactNode>>;
}): React.JSX.Element {
  const mounted = (
    <>
      {SCREEN_ORDER.map((id) => (
        <KeepAliveScreenSlot
          key={`${id}:${APPLICATION_SESSION_SCREENS.has(id) ? "app" : (projectEpoch ?? "no-project")}`}
          isActive={id === active}
          isAvailable={id in screens}
        >
          {screens[id]}
        </KeepAliveScreenSlot>
      ))}
    </>
  );

  // Reports its own share of the commit so the app-level measurement can say
  // how much of a switch is the screen and how much is everything around it.
  return MEASURE_SWITCHES ? (
    <Profiler
      id="screens"
      onRender={(_id, _phase, actualDuration) => {
        screensRenderMs = actualDuration;
      }}
    >
      {mounted}
    </Profiler>
  ) : (
    mounted
  );
}

/** Owns the committed lifetime of one screen without mutating refs during
 * render. React may start and abandon a concurrent render; only a layout
 * effect proves that a screen was actually committed. The current screen is
 * still rendered on its first visit, while the last committed element is
 * reused by identity after it becomes inactive. */
function KeepAliveScreenSlot({
  isActive,
  isAvailable,
  children,
}: {
  isActive: boolean;
  isAvailable: boolean;
  children: React.ReactNode;
}): React.JSX.Element | null {
  const hasCommittedVisit = useRef(false);
  const lastCommittedElement = useRef<React.ReactNode>(null);
  const lifecycle = useRef(createScreenLifecycleController(isActive ? "active" : "hidden")).current;

  useLayoutEffect(() => {
    if (!isAvailable) {
      hasCommittedVisit.current = false;
      lastCommittedElement.current = null;
      lifecycle.evict();
    } else if (isActive) {
      hasCommittedVisit.current = true;
      lastCommittedElement.current = children;
    }
    if (isAvailable) {
      lifecycle.transition(isActive ? "active" : "hidden");
    }
  }, [children, isActive, isAvailable]);

  if (!isAvailable || (!isActive && !hasCommittedVisit.current)) {
    return null;
  }

  return (
    <div className="screen-slot" hidden={!isActive} inert={!isActive}>
      <ScreenLifecycleProvider controller={lifecycle}>
        {/* A render error stays in the screen it happened in: the rail, the
            status bar and every other screen keep working. */}
        <ScreenErrorBoundary>{isActive ? children : lastCommittedElement.current}</ScreenErrorBoundary>
      </ScreenLifecycleProvider>
    </div>
  );
}

/** A failed view's notice, in the reader's language. Only the notice reads
 * the language: the boundary around a working screen asks nothing of it. */
function LocalizedViewError({ error, window: inWindow = false, onAction }: {
  error: Error;
  window?: boolean;
  onAction: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const labels = inWindow
    ? { title: t.commonWindowErrorTitle, message: t.commonWindowErrorMessage, action: t.commonWindowErrorReload, details: t.commonViewErrorDetails }
    : { title: t.commonViewErrorTitle, message: t.commonViewErrorMessage, action: t.commonViewErrorRetry, details: t.commonViewErrorDetails };
  return <ViewErrorNotice error={error} labels={labels} onAction={onAction} />;
}

/** A screen's error boundary. */
export function ScreenErrorBoundary({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <ErrorBoundary fallback={(error, retry) => <LocalizedViewError error={error} onAction={retry} />}>
      {children}
    </ErrorBoundary>
  );
}

/** The last line: an error outside every screen — in the shell itself —
 * still leaves a window that says what happened and reloads, never a blank
 * one. */
export function WindowErrorBoundary({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <ErrorBoundary
      fallback={(error) => (
        <div className="window-error">
          <LocalizedViewError error={error} window onAction={() => window.location.reload()} />
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
