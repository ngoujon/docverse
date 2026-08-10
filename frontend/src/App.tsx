import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LandingPage from "./pages/LandingPage";
import WorkspaceApp from "./pages/WorkspaceApp";
import PrivacyPage from "./pages/PrivacyPage";
import FaqPage from "./pages/FaqPage";
import PricingPage from "./pages/PricingPage";
import TermsPage from "./pages/TermsPage";
import LegalNoticePage from "./pages/LegalNoticePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import NewsletterConfirmPage from "./pages/NewsletterConfirmPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import OAuthCallbackPage from "./pages/OAuthCallbackPage";
import DashboardPage from "./pages/DashboardPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AccountSettingsPage from "./pages/AccountSettingsPage";
import ProtectedRoute from "./components/ProtectedRoute";
import SupportChatWidget from "./components/SupportChatWidget";

// The support widget helps visitors use the site/app - shown on the public
// marketing pages, not inside the real product (workspace app) where it
// would just be visual noise on top of the actual tool.
const SUPPORT_WIDGET_EXCLUDED_PREFIXES = ["/app", "/share"];

export default function App() {
  const { i18n } = useTranslation();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.lang = i18n.language?.slice(0, 2) || "fr";
  }, [i18n.language]);

  const showSupportWidget = !SUPPORT_WIDGET_EXCLUDED_PREFIXES.some((p) => location.pathname.startsWith(p));

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
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/account"
          element={
            <ProtectedRoute>
              <AccountSettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute adminOnly>
              <AdminDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <WorkspaceApp />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/:spaceId"
          element={
            <ProtectedRoute>
              <WorkspaceApp />
            </ProtectedRoute>
          }
        />
        <Route
          path="/share/:shareToken"
          element={
            <ProtectedRoute>
              <WorkspaceApp />
            </ProtectedRoute>
          }
        />
        <Route path="/confidentialite" element={<PrivacyPage />} />
        <Route path="/tarifs" element={<PricingPage />} />
        <Route path="/cgu" element={<TermsPage />} />
        <Route path="/mentions-legales" element={<LegalNoticePage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
      {showSupportWidget && <SupportChatWidget />}
    </>
  );
}
