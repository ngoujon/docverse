import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LandingPage from "./pages/LandingPage";
import WorkspaceApp from "./pages/WorkspaceApp";
import PrivacyPage from "./pages/PrivacyPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import NewsletterConfirmPage from "./pages/NewsletterConfirmPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import DashboardPage from "./pages/DashboardPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AccountSettingsPage from "./pages/AccountSettingsPage";
import ProtectedRoute from "./components/ProtectedRoute";

export default function App() {
  const { i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.lang = i18n.language?.slice(0, 2) || "fr";
  }, [i18n.language]);

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/newsletter/confirm" element={<NewsletterConfirmPage mode="confirm" />} />
      <Route path="/newsletter/unsubscribe" element={<NewsletterConfirmPage mode="unsubscribe" />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
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
      <Route path="/share/:shareToken" element={<WorkspaceApp />} />
      <Route path="/confidentialite" element={<PrivacyPage />} />
      <Route path="*" element={<LandingPage />} />
    </Routes>
  );
}
