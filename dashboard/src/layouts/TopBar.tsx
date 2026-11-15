import React, { useState } from "react";
import {
  Bell,
  Menu,
} from "lucide-react";
import { NavigationTab } from "@/types/navigation";
import { clsx } from "clsx";

interface TopBarProps {
  activeTab?: NavigationTab;
  onTabChange?: (tab: NavigationTab) => void;
  onToggleSidebar?: () => void;
  isScanning?: boolean;
  statusText?: string;
  className?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab = "dashboard",
  onTabChange,
  onToggleSidebar,
  isScanning = false,
  statusText = "Engine Ready",
  className,
}) => {
  const [showNotifications, setShowNotifications] = useState(false);

  const topNavTabs: { id: NavigationTab; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "scan", label: "Scans" },
    { id: "findings", label: "Findings" },
    { id: "pull-requests", label: "Pull Requests" },
    { id: "history", label: "History" },
  ];

  return (
    <header
      className={clsx(
        "h-16 px-4 sm:px-6 lg:px-8 border-b border-[#292D2A] bg-[#080909]/90 backdrop-blur-md flex items-center justify-between gap-4 sticky top-0 z-30 select-none",
        className
      )}
    >
      {/* Left: Brand Identity + Mobile Trigger */}
      <div className="flex items-center gap-6">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Toggle navigation"
          className="p-2 rounded-xl bg-[#101211] border border-[#292D2A] text-[#A5AAA6] hover:text-[#F4F5F4] hover:border-[#363C38] lg:hidden cursor-pointer"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Brand: </> CodeSage */}
        <div
          onClick={() => onTabChange?.("dashboard")}
          className="flex items-center gap-2.5 cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-lg bg-[#151716] border border-[#292D2A] group-hover:border-[#8CFF8C]/50 flex items-center justify-center font-mono text-xs font-bold text-[#8CFF8C] transition-colors shadow-sm">
            &lt;/&gt;
          </div>
          <span className="font-sans font-bold text-base text-[#F4F5F4] tracking-tight group-hover:text-white transition-colors">
            CodeSage
          </span>
        </div>

        {/* Center Pill Tabs (Desktop) */}
        <nav className="hidden md:flex items-center gap-1.5 ml-4 p-1 rounded-full bg-[#101211] border border-[#292D2A]">
          {topNavTabs.map((tab) => {
            const isActive =
              activeTab === tab.id ||
              (tab.id === "scan" && activeTab === "scan");
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange?.(tab.id)}
                className={clsx(
                  "px-3.5 py-1 rounded-full text-xs font-medium font-sans transition-all cursor-pointer",
                  isActive
                    ? "bg-[#16351F] text-[#8CFF8C] border border-[#8CFF8C]/40 shadow-[0_0_12px_rgba(140,255,140,0.15)]"
                    : "text-[#A5AAA6] hover:text-[#F4F5F4] hover:bg-[#151716] border border-transparent"
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Right Controls: Engine Status, Notification Bell, User Avatar */}
      <div className="flex items-center gap-3 shrink-0">
        {/* CodeSage Engine Status Pill */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-[#101211] border border-[#292D2A] text-xs font-mono">
          <span
            className={clsx(
              "w-2 h-2 rounded-full",
              isScanning
                ? "bg-[#8CFF8C] animate-pulse shadow-[0_0_8px_rgba(140,255,140,0.9)]"
                : "bg-[#52D96B]"
            )}
          />
          <span className="text-[#A5AAA6] text-[11px]">
            {isScanning ? "Scanning Active" : statusText}
          </span>
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotifications((prev) => !prev)}
            aria-label="Notifications"
            className="p-2 rounded-full bg-[#101211] border border-[#292D2A] text-[#A5AAA6] hover:text-[#F4F5F4] hover:border-[#363C38] transition-colors relative cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#8CFF8C] ring-2 ring-[#080909]" />
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-72 p-3 bg-[#101211] border border-[#292D2A] rounded-2xl shadow-elevated z-50 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#292D2A] text-[#F4F5F4] font-medium">
                <span>System Notifications</span>
                <span className="text-[10px] text-[#8CFF8C] font-mono">Live</span>
              </div>
              <div className="py-2.5 space-y-2 font-sans text-[#A5AAA6]">
                <div className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#8CFF8C] mt-1 shrink-0" />
                  <p className="text-[11px] leading-snug">
                    AST taint pipeline verified 19 auto-remediated patches in background.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#52D96B] mt-1 shrink-0" />
                  <p className="text-[11px] leading-snug">
                    Security engines (Semgrep, Bandit, Gitleaks) synchronized.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Avatar */}
        <div className="w-8 h-8 rounded-full bg-[#151716] border border-[#292D2A] text-[#F4F5F4] font-mono text-xs font-semibold flex items-center justify-center select-none shadow-sm cursor-pointer hover:border-[#8CFF8C]/50 transition-colors">
          GS
        </div>
      </div>
    </header>
  );
};
