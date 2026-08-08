import { Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import WorkspaceApp from "./pages/WorkspaceApp";
import PrivacyPage from "./pages/PrivacyPage";

export default function App() {
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
