import { useCallback, useMemo, useSyncExternalStore } from "react";

import { useScreenLifecycleController } from "../../runtime/screen/module";
import type { ConflictsController, ConflictsState } from "./controller";
import type { ConflictsQuery } from "./port";

/** For the shell's entries (Overview, Changes, the palette), which stay
 * subscribed whatever screen shows. */
export function useConflictsState(controller: ConflictsController, query: ConflictsQuery): ConflictsState {
  const subscribe = useCallback((listener: () => void) => controller.subscribe(query, listener), [controller, query]);
  const getSnapshot = useCallback(() => controller.getSnapshot(query), [controller, query]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** The screen's own subscription: frozen while its keep-alive slot is hidden
 * and synchronized on reactivation. Visibility never starts a read. */
export function useActiveConflictsState(controller: ConflictsController, query: ConflictsQuery): ConflictsState {
  const lifecycle = useScreenLifecycleController();
  const bridge = useMemo(() => {
    let selected = controller.getSnapshot(query);
    let unsubscribeStore: (() => void) | null = null;
    const listeners = new Set<() => void>();
    const update = (): void => {
      const next = controller.getSnapshot(query);
      if (Object.is(selected, next)) return;
      selected = next;
      for (const listener of [...listeners]) listener();
    };
    const synchronize = (): void => {
      if (lifecycle.getSnapshot() === "active") {
        update();
        unsubscribeStore ??= controller.subscribe(query, update);
      } else {
        unsubscribeStore?.();
        unsubscribeStore = null;
      }
    };
    return {
      getSnapshot: () => selected,
      subscribe(listener: () => void) {
        listeners.add(listener);
        const unsubscribeLifecycle = lifecycle.subscribe(synchronize);
        synchronize();
        return () => {
          listeners.delete(listener);
          unsubscribeLifecycle();
          if (listeners.size === 0) {
            unsubscribeStore?.();
            unsubscribeStore = null;
          }
        };
      },
    };
  }, [controller, lifecycle, query]);
  const subscribe = useCallback((listener: () => void) => bridge.subscribe(listener), [bridge]);
  return useSyncExternalStore(subscribe, bridge.getSnapshot, bridge.getSnapshot);
}
