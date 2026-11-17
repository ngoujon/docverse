/** Page kinds understood by pages/_app.tsx. */

import type { ComponentType } from "react";
import ProtectedRoute from "./components/layout/ProtectedRoute";

export type AppPage = ComponentType & {
  /** Rendered in the browser only (see App's `clientOnly`). */
  clientOnly?: boolean;
  /** One of the workspace routes (/app, /app/:spaceId, /share/:token). */
  workspace?: boolean;
};

/** A page that needs the browser: account forms, signed-in pages. With
 * `protect`, only for a signed-in user (`"admin"`: admins only). */
export function clientOnlyPage(Page: ComponentType, protect?: "user" | "admin"): AppPage {
  const Wrapped: AppPage = protect
    ? () => (
        <ProtectedRoute adminOnly={protect === "admin"}>
          <Page />
        </ProtectedRoute>
      )
    : () => <Page />;
  Wrapped.clientOnly = true;
  return Wrapped;
}

/** Marker page for the workspace routes. _app renders the workspace itself,
 * as one persistent element across /app, /app/:spaceId and /share/:token,
 * so moving between spaces keeps its state instead of remounting it. */
export function workspacePage(): AppPage {
  const Marker: AppPage = () => null;
  Marker.clientOnly = true;
  Marker.workspace = true;
  return Marker;
}
