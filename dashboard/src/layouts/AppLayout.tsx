import React from "react";
import { Shield, Activity, History, ListFilter } from "lucide-react";
import { clsx } from "clsx";

interface AppLayoutProps {
  children: React.ReactNode;
  activeTab?: "scan" | "findings" | "history";
  onTabChange?: (tab: "scan" | "findings" | "history") => void;
  isScanning?: boolean;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  activeTab = "scan",
  onTabChange,
  isScanning = false,
}) => {
  return (
    <div className="min-h-screen flex flex-col bg-sage-950 bg-grid-subtle text-sage-100">
      {/* Top Bar Navigation */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-sage-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-orange/90 to-accent-violet/90 flex items-center justify-center shadow-glow-orange border border-white/20">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-sans font-bold text-lg tracking-tight text-white">
                  CodeSage
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-accent-violet/20 text-accent-violet border border-accent-violet/30 font-semibold">
                  Autonomous v2.0
                </span>
              </div>
              <p className="text-[11px] text-sage-400 font-mono -mt-0.5">
                AI Vulnerability Triage & Automated Patching
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-sage-900/90 border border-white/[0.08] p-1 rounded-xl">
            <button
              onClick={() => onTabChange?.("scan")}
              className={clsx(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                activeTab === "scan"
                  ? "bg-sage-800 text-white shadow-sm border border-white/[0.1]"
                  : "text-sage-400 hover:text-sage-200 hover:bg-sage-850/50"
              )}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Scan & Engine</span>
            </button>
            <button
              onClick={() => onTabChange?.("findings")}
              className={clsx(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                activeTab === "findings"
                  ? "bg-sage-800 text-white shadow-sm border border-white/[0.1]"
                  : "text-sage-400 hover:text-sage-200 hover:bg-sage-850/50"
              )}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>Vulnerabilities</span>
            </button>
            <button
              onClick={() => onTabChange?.("history")}
              className={clsx(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                activeTab === "history"
                  ? "bg-sage-800 text-white shadow-sm border border-white/[0.1]"
                  : "text-sage-400 hover:text-sage-200 hover:bg-sage-850/50"
              )}
            >
              <History className="w-3.5 h-3.5" />
              <span>Audit History</span>
            </button>
          </nav>

          {/* Status Indicator */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.08] bg-sage-900/80 text-xs font-mono">
              <span
                className={clsx(
                  "w-2 h-2 rounded-full",
                  isScanning
                    ? "bg-accent-orange animate-ping"
                    : "bg-emerald-400"
                )}
              />
              <span className="text-sage-300">
                {isScanning ? "Agent Pipeline Active" : "Backend Ready"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Subtle Footer */}
      <footer className="border-t border-white/[0.05] py-4 text-center text-xs text-sage-500 font-mono">
        CodeSage &bull; Enterprise Static Analysis &bull; LangGraph Autonomous Security Agents
      </footer>
    </div>
  );
};
