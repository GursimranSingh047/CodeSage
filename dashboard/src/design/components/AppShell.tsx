import React from "react";
import { Outlet } from "react-router-dom";
import TopNavigation from "./TopNavigation";

export default function AppShell() {
  return (
    <div className="min-h-screen bg-void font-sans text-ink">
      <TopNavigation />
      <main className="mx-auto max-w-[1400px] space-y-4 px-4 py-5 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
