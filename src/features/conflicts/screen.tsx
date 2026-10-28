import { Split } from "lucide-react";
import { createLazyScreenContainer, type ScreenModule } from "../../runtime/screen/module";

const container = createLazyScreenContainer(() => import("./ConflictsScreen"), (module) => module.ConflictsScreen);
export const ConflictsScreen = container.Component;

/** A paused operation is not a place (epic 037): the screen is registered for
 * lazy loading, keep-alive, the project guard and eviction, but it has no rail
 * entry and no fixed palette entry. The shell offers it while a session exists. */
export const conflictsScreenModule = {
  kind: "screen",
  id: "conflicts",
  section: "project",
  labelKey: "navConflicts",
  descriptionKey: null,
  disabledLabelKey: null,
  commandLabelKey: null,
  icon: <Split />,
  requiresProject: true,
  inCompactNav: false,
  inRail: false,
  container,
  additionalPreloads: [],
  lifecycle: { hidden: "retain-suspended", evict: "project-session" },
  accessibility: { inactive: "hidden-inert", announcements: "active-only" },
  performanceBudget: { warmSwitchWarningMs: 40, warmSwitchFailureMs: 50, maxVisibleDescendants: 1000 },
} as const satisfies ScreenModule;
