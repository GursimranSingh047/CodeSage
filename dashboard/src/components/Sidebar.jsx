import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Shield,
  LayoutDashboard,
  FolderGit2,
  FolderClock,
  ShieldAlert,
  Wrench,
  GitPullRequest,
  FileText,
  Settings,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "GitHub Analysis", to: "/", icon: FolderGit2, isPrimary: true },
  { label: "My Scans", to: "/scans", icon: FolderClock },
  { label: "Findings", to: "/findings", icon: ShieldAlert },
  { label: "Fix Suggestions", to: "/patches", icon: Wrench },
  { label: "Pull Requests", to: "/pull-requests", icon: GitPullRequest },
  { label: "Reports", to: "/reports", icon: FileText },
  { label: "Settings", to: "/settings", icon: Settings },
];

export default function Sidebar() {
  const location = useLocation();

  const isItemActive = (item) => {
    if (item.label === "GitHub Analysis") {
      return location.pathname === "/" || location.pathname === "/analysis" || location.pathname === "/pipeline";
    }
    return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-[240px] flex-col border-r border-[#EBE7DF] bg-[#F9F8F5] px-4 py-5 font-sans">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-2 pb-6">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#171717] text-white shadow-sm">
          <Shield size={19} className="text-[#C28E4A]" strokeWidth={2.4} />
        </span>
        <div>
          <h1 className="font-serif text-[18px] font-bold leading-tight tracking-tight text-[#171717]">
            CodeSage
          </h1>
          <p className="text-[11px] font-medium tracking-tight text-[#8A857E]">
            Analyze · Secure · Improve
          </p>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 space-y-1" aria-label="Main Navigation">
        {NAV_ITEMS.map((item) => {
          const active = isItemActive(item);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              to={item.to}
              style={{ color: active ? "#FFFFFF" : undefined }}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-medium transition-all ${
                active
                  ? "bg-[#171717] !text-white shadow-sm"
                  : "text-[#5C5852] hover:bg-[#F2EEE7] hover:text-[#171717]"
              }`}
            >
              <Icon
                size={17}
                className={active ? "!text-white" : "text-[#7D7871]"}
                strokeWidth={active ? 2.2 : 1.9}
              />
              <span className={active ? "!text-white" : ""}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Feature / Mission Callout Card */}
      <div className="relative my-4 overflow-hidden rounded-2xl bg-gradient-to-br from-[#1E2024] via-[#141517] to-[#0D0E10] p-4 text-white shadow-md border border-[#2B2D31]/40">
        <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[#C28E4A]/15 blur-xl" />
        <h2 className="font-serif text-[15px] font-semibold tracking-tight text-white">
          From Code<br />to Confidence
        </h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-[#A6A29C]">
          AI-powered security audits, code analysis and intelligent fixes.
        </p>
      </div>

      {/* User Profile Footer */}
      <div className="flex items-center gap-3 border-t border-[#EBE7DF] pt-4 px-1">
        <div className="relative">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-[#E5E0D8] text-[13px] font-semibold text-[#171717]">
            GS
          </div>
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#F9F8F5] bg-[#10B981]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-[#171717]">
            Gursimran Singh
          </p>
          <p className="text-[11px] font-medium text-[#8A857E]">
            Free Plan
          </p>
        </div>
      </div>
    </aside>
  );
}
