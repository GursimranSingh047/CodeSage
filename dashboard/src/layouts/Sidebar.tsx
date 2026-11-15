import React from "react";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Terminal,
  FolderGit2,
  ShieldAlert,
  History,
  GitPullRequest,
  Settings,
  Blocks,
} from "lucide-react";
import { NavigationTab } from "@/types/navigation";
import { clsx } from "clsx";

interface SidebarProps {
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  className?: string;
  findingsCount?: number;
}

interface NavItem {
  id: NavigationTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  className,
  findingsCount,
}) => {
  const primaryNav: NavItem[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "repositories", label: "Repositories", icon: FolderGit2 },
    { id: "scan", label: "Scans", icon: Terminal },
    {
      id: "findings",
      label: "Findings",
      icon: ShieldAlert,
      badge: findingsCount !== undefined && findingsCount > 0 ? findingsCount : undefined,
    },
    { id: "pull-requests", label: "Pull Requests", icon: GitPullRequest },
    { id: "history", label: "History", icon: History },
  ];

  const secondaryNav: NavItem[] = [
    { id: "reports", label: "Integrations", icon: Blocks },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  const renderNavGroup = (items: NavItem[]) => (
    <div className="space-y-1">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            className={clsx(
              "w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-sans font-medium transition-all group relative cursor-pointer select-none",
              isActive
                ? "bg-[#151716] text-[#F4F5F4] border border-[#292D2A] shadow-sm"
                : "text-[#A5AAA6] hover:text-[#F4F5F4] hover:bg-[#101211]"
            )}
          >
            <div className="flex items-center gap-2.5">
              <Icon
                className={clsx(
                  "w-4 h-4 transition-colors shrink-0",
                  isActive
                    ? "text-[#8CFF8C]"
                    : "text-[#666C68] group-hover:text-[#A5AAA6]"
                )}
              />
              <span className="tracking-tight">{item.label}</span>
            </div>

            {/* Subtle Green Active Pip */}
            {isActive && (
              <motion.span
                layoutId="activeNavPip"
                className="w-1.5 h-1.5 rounded-full bg-[#8CFF8C] shadow-[0_0_8px_rgba(140,255,140,0.8)] shrink-0"
              />
            )}

            {/* Badge for items like Findings count */}
            {!isActive && item.badge !== undefined && (
              <span className="px-1.5 py-0.2 rounded-md bg-[#16351F] text-[#8CFF8C] border border-[#8CFF8C]/30 font-mono text-[10px] font-semibold">
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <aside
      className={clsx(
        "w-60 h-screen sticky top-0 bg-[#080909] border-r border-[#292D2A] flex flex-col justify-between p-4 select-none z-20 shrink-0",
        className
      )}
    >
      <div className="space-y-6">
        {/* Navigation list */}
        <div className="space-y-4 pt-1">
          {renderNavGroup(primaryNav)}

          {/* Minimal hairline divider */}
          <div className="pt-2 border-t border-[#292D2A]" />

          {renderNavGroup(secondaryNav)}
        </div>
      </div>

      {/* Engine Status at bottom of sidebar */}
      <div className="p-3 rounded-xl bg-[#101211] border border-[#292D2A] space-y-2">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="text-[#666C68]">Pipeline Engine</span>
          <span className="inline-flex items-center gap-1 text-[#8CFF8C]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8CFF8C] animate-pulse" />
            v2.4 Ready
          </span>
        </div>
        <p className="text-[10px] text-[#A5AAA6] leading-tight font-sans">
          Semgrep + Bandit + AST Taint Sandbox Active
        </p>
      </div>
    </aside>
  );
};
