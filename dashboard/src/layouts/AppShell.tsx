import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/layouts/Sidebar";
import { TopBar } from "@/layouts/TopBar";
import { AmbientBackground } from "@/components/background/AmbientBackground";
import { NavigationTab } from "@/types/navigation";
import { pageTransitionVariants } from "@/animations/variants";

interface AppShellProps {
  children: React.ReactNode;
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  isScanning?: boolean;
  statusText?: string;
  findingsCount?: number;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  activeTab,
  onTabChange,
  isScanning = false,
  statusText = "Engine Ready",
  findingsCount = 0,
}) => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#080909] text-[#F4F5F4] flex relative overflow-x-hidden font-sans">
      {/* Background Atmosphere */}
      <AmbientBackground />

      {/* Desktop Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => {
          onTabChange(tab);
          setMobileSidebarOpen(false);
        }}
        findingsCount={findingsCount}
        className="hidden lg:flex"
      />

      {/* Mobile Drawer Sidebar */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileSidebarOpen(false)}
              className="fixed inset-0 bg-[#080909]/80 backdrop-blur-sm z-40 lg:hidden"
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed inset-y-0 left-0 z-50 lg:hidden flex"
            >
              <Sidebar
                activeTab={activeTab}
                onTabChange={(tab) => {
                  onTabChange(tab);
                  setMobileSidebarOpen(false);
                }}
                findingsCount={findingsCount}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <TopBar
          activeTab={activeTab}
          onTabChange={onTabChange}
          onToggleSidebar={() => setMobileSidebarOpen((prev) => !prev)}
          isScanning={isScanning}
          statusText={statusText}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              variants={pageTransitionVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};
