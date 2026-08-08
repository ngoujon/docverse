import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LandingPage from "./pages/LandingPage";
import WorkspaceApp from "./pages/WorkspaceApp";
import PrivacyPage from "./pages/PrivacyPage";

export default function App() {
  const { i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.lang = i18n.language?.slice(0, 2) || "fr";
  }, [i18n.language]);

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/app" element={<WorkspaceApp />} />
      <Route path="/app/:spaceId" element={<WorkspaceApp />} />
      <Route path="/confidentialite" element={<PrivacyPage />} />
      <Route path="*" element={<LandingPage />} />
    </Routes>
  );
}
