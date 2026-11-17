import type { AppProps } from "next/app";
import Head from "next/head";
import dynamic from "next/dynamic";
import "@fontsource-variable/inter";
import "../src/index.css";
import "../src/i18n";
import App from "../src/App";
import ProtectedRoute from "../src/components/layout/ProtectedRoute";
import { AuthProvider } from "../src/hooks/useAuth";
import type { AppPage } from "../src/pageKinds";

// Signed-in workspace split out of the main bundle: a visitor landing on
// the marketing site doesn't download (nor parse) the whole product.
const WorkspaceApp = dynamic(() => import("../src/pages/app/WorkspaceApp"), { ssr: false });

export default function DocverseApp({ Component, pageProps }: AppProps) {
  const Page = Component as AppPage;
  return (
    <>
      <Head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <AuthProvider>
        <App clientOnly={Page.clientOnly}>
          {Page.workspace ? (
            // Same element on every workspace route (see pageKinds.tsx).
            <ProtectedRoute>
              <WorkspaceApp />
            </ProtectedRoute>
          ) : (
            <Page {...pageProps} />
          )}
        </App>
      </AuthProvider>
    </>
  );
}
