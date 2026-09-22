import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "./theme";
import { ScanSessionProvider } from "./session/ScanSessionContext.jsx";
import { ScanFlowProvider } from "./design/ScanFlowContext";
import "./styles.css";
import "./design/tokens.css";
import LandingV2 from "./design/pages/LandingV2";
import AgentsAtWork from "./design/pages/AgentsAtWork";
import ResultsDashboard from "./design/pages/ResultsDashboard";
import FindingsTabPage from "./design/pages/FindingsTabPage";
import PatchesPage from "./design/pages/PatchesPage";
import AppShell from "./design/components/AppShell";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import HistoryPage from "./pages/HistoryPage.jsx";
import FindingsPage from "./pages/FindingsPage.jsx";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <ScanFlowProvider>
          <ScanSessionProvider>
            <Routes>
              <Route path="/" element={<LandingV2 />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/pipeline" element={<AgentsAtWork />} />
              <Route path="/results" element={<ResultsDashboard />} />
              <Route path="/findings" element={<FindingsTabPage />} />
              <Route path="/patches" element={<PatchesPage />} />
              <Route path="/dashboard/scan" element={<Navigate to="/pipeline" replace />} />
              <Route path="/dashboard" element={<Navigate to="/pipeline" replace />} />
              <Route path="/dashboard" element={<AppShell />}>
                <Route path="history" element={<HistoryPage />} />
                <Route path="scan/:scanId/findings" element={<FindingsPage />} />
              </Route>
            </Routes>
          </ScanSessionProvider>
        </ScanFlowProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#111411",
              color: "#f2f2f2",
              border: "1px solid rgba(143,245,176,0.25)",
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
