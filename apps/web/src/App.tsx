import { NavLink, Route, Routes, useLocation } from "react-router-dom";

import { AdminPage } from "./pages/AdminPage";
import { ChatbotPage } from "./pages/ChatbotPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { PrivacyRequestPage } from "./pages/PrivacyRequestPage";
import { ReceiptPage } from "./pages/ReceiptPage";

const navClassName = ({ isActive }: { isActive: boolean }): string =>
  `rounded-full px-3 py-2 text-sm transition ${
    isActive
      ? "bg-blue-600 text-white"
      : "bg-white/70 text-slate-700 hover:bg-white hover:text-slate-900"
  }`;

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<ChatbotPage />} />
    <Route path="/admin" element={<AdminPage />} />
    <Route path="/privacy" element={<PrivacyPage />} />
    <Route path="/privacy-request" element={<PrivacyRequestPage />} />
    <Route path="/privacy-request/verify" element={<PrivacyRequestPage />} />
    <Route path="/receipt/:receiptId" element={<ReceiptPage />} />
  </Routes>
);

export const App = () => {
  const location = useLocation();
  const isHome = location.pathname === "/";

  if (isHome) {
    return <AppRoutes />;
  }

  return (
    <div className="min-h-screen bg-app px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="panel flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-blue-700">BBB Serving Connecticut</p>
            <h1 className="text-2xl font-semibold text-slate-900">Lead Intake Assistant</h1>
          </div>
          <nav className="flex flex-wrap gap-2">
            <NavLink className={navClassName} to="/">
              Chatbot
            </NavLink>
            <NavLink className={navClassName} to="/admin">
              Admin
            </NavLink>
            <NavLink className={navClassName} to="/privacy">
              Privacy
            </NavLink>
            <NavLink className={navClassName} to="/privacy-request">
              Privacy Request
            </NavLink>
          </nav>
        </header>

        <AppRoutes />
      </div>
    </div>
  );
};
