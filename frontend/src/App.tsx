import { useEffect, type ReactNode } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LandingPage from "./pages/public/LandingPage";
import WorkspaceApp from "./pages/app/WorkspaceApp";
import PrivacyPage from "./pages/public/PrivacyPage";
import FaqPage from "./pages/public/FaqPage";
import TermsPage from "./pages/public/TermsPage";
import LegalNoticePage from "./pages/public/LegalNoticePage";
import DemoPage from "./pages/public/DemoPage";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import NewsletterConfirmPage from "./pages/auth/NewsletterConfirmPage";
import VerifyEmailPage from "./pages/auth/VerifyEmailPage";
import OAuthCallbackPage from "./pages/auth/OAuthCallbackPage";
import DashboardPage from "./pages/app/DashboardPage";
import AdminDashboardPage from "./pages/app/AdminDashboardPage";
import AccountSettingsPage from "./pages/app/AccountSettingsPage";
import ProtectedRoute from "./components/layout/ProtectedRoute";
import SupportChatWidget from "./components/layout/SupportChatWidget";
import AnalyticsTracker from "./components/layout/AnalyticsTracker";
import CookieConsentBanner from "./components/layout/CookieConsentBanner";
import { analyticsEnabled, isTrackablePath } from "./utils/analytics";

// The support widget helps visitors use the site/app - shown on the public
// marketing pages, not inside the real product (workspace app) where it
// would just be visual noise on top of the actual tool.
const SUPPORT_WIDGET_EXCLUDED_PREFIXES = ["/app", "/share"];

/** Signed-in only route (admin only with `adminOnly`). */
const protect = (page: ReactNode, adminOnly = false) => <ProtectedRoute adminOnly={adminOnly}>{page}</ProtectedRoute>;

/** Root component: route table plus the global widgets (support chat,
 * audience measurement and its consent banner). */
export default function App() {
  const { i18n } = useTranslation();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.lang = i18n.language?.slice(0, 2) || "fr";
  }, [i18n.language]);

  const showSupportWidget = !SUPPORT_WIDGET_EXCLUDED_PREFIXES.some((p) => location.pathname.startsWith(p));
  // Only the pages the audience measurement actually covers ask for consent.
  const showConsentBanner = analyticsEnabled && isTrackablePath(location.pathname);

  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/newsletter/confirm" element={<NewsletterConfirmPage mode="confirm" />} />
        <Route path="/newsletter/unsubscribe" element={<NewsletterConfirmPage mode="unsubscribe" />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/oauth-callback" element={<OAuthCallbackPage />} />
        <Route path="/dashboard" element={protect(<DashboardPage />)} />
        <Route path="/account" element={protect(<AccountSettingsPage />)} />
        <Route path="/admin" element={protect(<AdminDashboardPage />, true)} />
        <Route path="/app" element={protect(<WorkspaceApp />)} />
        <Route path="/app/:spaceId" element={protect(<WorkspaceApp />)} />
        <Route path="/share/:shareToken" element={protect(<WorkspaceApp />)} />
        <Route path="/confidentialite" element={<PrivacyPage />} />
        <Route path="/cgu" element={<TermsPage />} />
        <Route path="/mentions-legales" element={<LegalNoticePage />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
      {showSupportWidget && <SupportChatWidget />}
      <AnalyticsTracker />
      {showConsentBanner && <CookieConsentBanner />}
    </>
  );
}
