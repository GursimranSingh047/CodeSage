import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../../components/Sidebar";
import TopBar from "../../components/TopBar";

export default function AppShell() {
  return (
    <div className="min-h-screen bg-[#F8F7F4] font-sans text-[#171717] antialiased">
      {/* Fixed Left Navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex flex-col pl-[240px] min-h-screen">
        <TopBar />
        <main className="flex-1 px-8 py-7 max-w-[1440px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
