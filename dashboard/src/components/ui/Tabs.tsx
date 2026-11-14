import React from "react";
import { motion } from "framer-motion";
import { clsx } from "clsx";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className,
}) => {
  return (
    <div
      className={clsx(
        "flex items-center gap-1 p-1 bg-sage-900/90 border border-white/[0.08] rounded-xl overflow-x-auto",
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={clsx(
              "relative flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-sans font-medium transition-colors whitespace-nowrap focus:outline-none",
              isActive ? "text-white" : "text-sage-400 hover:text-sage-200"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="activeTabPill"
                className="absolute inset-0 bg-sage-800 rounded-lg border border-white/[0.12] shadow-sm"
                transition={{ type: "spring", stiffness: 450, damping: 32 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={clsx(
                    "px-1.5 py-0.2 text-[10px] font-mono rounded font-medium",
                    isActive
                      ? "bg-accent-orange/20 text-orange-300 border border-accent-orange/30"
                      : "bg-sage-850 text-sage-400 border border-white/[0.06]"
                  )}
                >
                  {tab.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
};
