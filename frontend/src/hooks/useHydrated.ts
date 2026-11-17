import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False while React hydrates the static HTML (and during the build-time
 * render itself), true afterwards. Lets a component render exactly the
 * static markup first, then switch to browser-only values (stored
 * language...) without a hydration mismatch. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
