import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "./theme";
import { ScanSessionProvider } from "./session/ScanSessionContext.jsx";
import { ScanFlowProvider } from "./design/ScanFlowContext";
import "./styles.css";
import "./design/tokens.css";

import AppShell from "./design/components/AppShell";
import GitHubAnalysisPage from "./pages/GitHubAnalysisPage.jsx";
import LandingV2 from "./design/pages/LandingV2";
import AgentsAtWork from "./design/pages/AgentsAtWork";
import ResultsDashboard from "./design/pages/ResultsDashboard";
import FindingsTabPage from "./design/pages/FindingsTabPage";
import PatchesPage from "./design/pages/PatchesPage";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import HistoryPage from "./pages/HistoryPage.jsx";
import FindingsPage from "./pages/FindingsPage.jsx";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <ScanSessionProvider>
          <ScanFlowProvider>
            <Routes>
              {/* Main Application Shell with Editorial Left Sidebar & TopBar */}
              <Route element={<AppShell />}>
                <Route path="/" element={<GitHubAnalysisPage />} />
                <Route path="/analysis" element={<GitHubAnalysisPage />} />
                <Route path="/dashboard" element={<GitHubAnalysisPage />} />
                <Route path="/scans" element={<HistoryPage />} />
                <Route path="/findings" element={<FindingsTabPage />} />
                <Route path="/patches" element={<PatchesPage />} />
                <Route path="/pull-requests" element={<PatchesPage />} />
                <Route path="/reports" element={<ResultsDashboard />} />
                <Route path="/settings" element={<GitHubAnalysisPage />} />
                <Route path="/pipeline" element={<AgentsAtWork />} />
                <Route path="/results" element={<ResultsDashboard />} />
                <Route path="/dashboard/history" element={<HistoryPage />} />
                <Route path="/dashboard/scan/:scanId/findings" element={<FindingsPage />} />
              </Route>

              {/* Standalone pages */}
              <Route path="/landing" element={<LandingV2 />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ScanFlowProvider>
        </ScanSessionProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#171717",
              color: "#F8F7F4",
              border: "1px solid #383531",
              borderRadius: "12px",
              fontSize: "13px",
              boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)",
            },
          }}
        />
      </BrowserRouter>
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
