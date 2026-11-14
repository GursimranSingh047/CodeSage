import React from "react";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Terminal,
  FolderGit2,
  ShieldAlert,
  History,
  GitPullRequest,
  BarChart3,
  Settings,
  Shield,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { NavigationTab } from "@/types/navigation";
import { navItemHover } from "@/animations/variants";
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
  badgeVariant?: "orange" | "violet" | "teal" | "default";
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  className,
  findingsCount,
}) => {
  const navItems: NavItem[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "scan", label: "Scan", icon: Terminal },
    { id: "repositories", label: "Repositories", icon: FolderGit2 },
    {
      id: "findings",
      label: "Findings",
      icon: ShieldAlert,
      badge: findingsCount !== undefined && findingsCount > 0 ? findingsCount : undefined,
      badgeVariant: "orange",
    },
    { id: "history", label: "Scan History", icon: History },
    { id: "pull-requests", label: "Pull Requests", icon: GitPullRequest },
    { id: "reports", label: "Reports", icon: BarChart3 },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside
      className={clsx(
        "w-64 shrink-0 flex flex-col bg-sage-950 border-r border-white/[0.08] min-h-screen select-none relative z-30",
        className
      )}
    >
      {/* Brand Header */}
      <div className="p-5 pb-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-orange via-orange-600 to-accent-violet flex items-center justify-center shadow-glow-orange border border-white/20 shrink-0">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-sans font-bold text-base tracking-tight text-white">
                CodeSage
              </span>
            </div>
            <p className="text-[10px] font-mono text-sage-400 tracking-wider uppercase -mt-0.5">
              Analyze &bull; Secure &bull; Improve
            </p>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-sage-500 font-semibold">
          Platform
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <motion.button
              key={item.id}
              variants={navItemHover}
              initial="idle"
              whileHover="hover"
              onClick={() => onTabChange(item.id)}
              className={clsx(
                "relative w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-sans font-medium transition-colors group",
                isActive
                  ? "text-white font-semibold"
                  : "text-sage-400 hover:text-sage-200 hover:bg-sage-900/60"
              )}
            >
              {/* Active animated gradient indicator background */}
              {isActive && (
                <motion.div
                  layoutId="sidebarActiveBackground"
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-accent-orange/15 via-accent-orange/5 to-accent-violet/10 border-l-2 border-accent-orange border-y border-r border-white/[0.08] shadow-[0_0_20px_-3px_rgba(249,115,22,0.25)]"
                  transition={{ type: "spring", stiffness: 400, damping: 35 }}
                />
              )}

              <div className="relative z-10 flex items-center gap-3 truncate">
                <Icon
                  className={clsx(
                    "w-4 h-4 shrink-0 transition-colors",
                    isActive
                      ? "text-accent-orange"
                      : "text-sage-400 group-hover:text-sage-200"
                  )}
                />
                <span className="truncate">{item.label}</span>
              </div>

              {item.badge !== undefined && (
                <span
                  className={clsx(
                    "relative z-10 px-1.5 py-0.5 text-[10px] font-mono rounded font-medium",
                    isActive
                      ? "bg-accent-orange text-white"
                      : "bg-sage-850 text-sage-300 border border-white/[0.08]"
                  )}
                >
                  {item.badge}
                </span>
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* Promoted Feature Card (Ref Reference Image) */}
      <div className="p-3">
        <div className="p-4 rounded-xl relative overflow-hidden bg-gradient-to-br from-sage-900 via-sage-850 to-sage-900 border border-white/[0.08] shadow-glass">
          <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-br from-accent-violet/20 via-accent-orange/10 to-transparent rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 space-y-2">
            <div className="flex items-center gap-1.5 text-accent-orange text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Autonomous Patching</span>
            </div>
            <h4 className="font-sans font-bold text-white text-xs leading-snug">
              From Code to Confidence
            </h4>
            <p className="text-[11px] text-sage-400 leading-relaxed font-sans">
              AI-powered security audits, code analysis and verified fixes.
            </p>
          </div>
        </div>
      </div>

      {/* User Profile Footer */}
      <div className="p-3 border-t border-white/[0.06]">
        <div className="flex items-center justify-between p-2 rounded-xl hover:bg-sage-900/60 transition-colors cursor-pointer group">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sage-800 to-sage-700 border border-white/[0.12] flex items-center justify-center font-mono font-semibold text-xs text-sage-200 shrink-0">
              GS
            </div>
            <div className="min-w-0">
              <div className="text-xs font-sans font-medium text-white truncate">
                Gursimran Singh
              </div>
              <div className="text-[10px] font-mono text-sage-400 truncate flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Security Lead
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-sage-500 group-hover:text-sage-300 transition-colors shrink-0" />
        </div>
      </div>
    </aside>
  );
};
