import React, { useState } from "react";
import {
  Search,
  Bell,
  Menu,
  Command,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { clsx } from "clsx";

interface TopBarProps {
  onToggleSidebar?: () => void;
  isScanning?: boolean;
  statusText?: string;
  className?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  onToggleSidebar,
  isScanning = false,
  statusText = "Engine Ready",
  className,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <header
      className={clsx(
        "h-16 px-4 sm:px-6 border-b border-white/[0.08] bg-sage-950/80 backdrop-blur-xl flex items-center justify-between gap-4 sticky top-0 z-20 select-none",
        className
      )}
    >
      {/* Left: Mobile Toggle & Search */}
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-2 rounded-lg bg-sage-900 border border-white/[0.08] text-sage-400 hover:text-white lg:hidden"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Global Search Bar with ⌘K Indicator */}
        <div className="relative w-full max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-sage-400">
            <Search className="w-3.5 h-3.5" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search repositories, scans, findings, CWEs..."
            className="w-full pl-9 pr-14 py-2 bg-sage-900/90 border border-white/[0.09] rounded-xl text-xs font-sans text-sage-100 placeholder-sage-500 focus:outline-none focus:border-accent-orange/50 focus:ring-1 focus:ring-accent-orange/40 transition-all hover:border-white/[0.16]"
          />
          <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none">
            <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono font-medium text-sage-400 bg-sage-850 border border-white/[0.08] rounded shadow-sm">
              <Command className="w-2.5 h-2.5" /> K
            </kbd>
          </div>
        </div>
      </div>

      {/* Right: Engine Status, Notifications & Profile */}
      <div className="flex items-center gap-3 shrink-0">
        {/* CodeSage Engine Status */}
        <Tooltip content="FastAPI LangGraph Multi-Scanner Pipeline">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.08] bg-sage-900/90 text-xs font-mono">
            <span
              className={clsx(
                "w-2 h-2 rounded-full",
                isScanning
                  ? "bg-accent-orange animate-ping"
                  : "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]"
              )}
            />
            <span className="text-sage-300 font-medium hidden sm:inline">
              {isScanning ? "Scanning Active" : statusText}
            </span>
          </div>
        </Tooltip>

        {/* Notifications Popover Trigger */}
        <div className="relative">
          <Tooltip content="Recent Audit Alerts">
            <button
              type="button"
              onClick={() => setShowNotifications((p) => !p)}
              className={clsx(
                "relative p-2 rounded-xl border transition-colors",
                showNotifications
                  ? "bg-sage-850 border-accent-orange/40 text-accent-orange"
                  : "bg-sage-900 border-white/[0.08] text-sage-400 hover:text-white hover:bg-sage-850"
              )}
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent-orange border-2 border-sage-950" />
            </button>
          </Tooltip>

          {/* Notifications Dropdown Panel */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl bg-sage-900/95 backdrop-blur-xl border border-white/[0.12] shadow-glass-elevated p-3 z-50 space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
                <span className="text-xs font-mono uppercase tracking-wider font-semibold text-sage-200">
                  Audit Notifications
                </span>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-sage-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="p-2 rounded-lg bg-sage-850/60 border border-white/[0.06] flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-white">Verification Succeeded</div>
                    <div className="text-[11px] text-sage-400">
                      Patch verified in sandbox for shop.py:17 (CWE-89)
                    </div>
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-sage-850/60 border border-white/[0.06] flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-white">Critical Finding Detected</div>
                    <div className="text-[11px] text-sage-400">
                      Command injection in admin.py (CWE-78)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-accent-orange via-orange-600 to-accent-violet p-[1px] cursor-pointer">
          <div className="w-full h-full rounded-full bg-sage-950 flex items-center justify-center font-mono font-semibold text-xs text-white">
            GS
          </div>
        </div>
      </div>
    </header>
  );
};
