import React from "react";
import { Search, Sun, Moon, Bell } from "lucide-react";
import { useTheme } from "../theme";

export default function TopBar() {
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-[#EBE7DF] bg-[#F8F7F4]/90 px-8 backdrop-blur-md">
      {/* Search Bar */}
      <div className="relative w-full max-w-xl">
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[#96918A]">
          <Search size={16} />
        </span>
        <input
          type="text"
          placeholder="Search repositories, scans, findings..."
          className="w-full rounded-full border border-[#EBE7DF] bg-white py-2 pl-10 pr-12 text-[13.5px] text-[#171717] placeholder:text-[#96918A] shadow-xs focus:border-[#DBD5CA] focus:outline-none focus:ring-2 focus:ring-[#A97843]/15 transition-all"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center">
          <kbd className="rounded border border-[#EBE7DF] bg-[#F4F1EA] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-[#6B6762]">
            ⌘ K
          </kbd>
        </span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggle}
          aria-label="Toggle theme"
          className="grid h-9 w-9 place-items-center rounded-full border border-[#EBE7DF] bg-white text-[#5C5852] shadow-xs transition hover:bg-[#F4F1EA] hover:text-[#171717]"
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* Notification bell */}
        <button
          type="button"
          aria-label="View notifications"
          className="relative grid h-9 w-9 place-items-center rounded-full border border-[#EBE7DF] bg-white text-[#5C5852] shadow-xs transition hover:bg-[#F4F1EA] hover:text-[#171717]"
        >
          <Bell size={16} />
          <span className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-[#EF4444] text-[9.5px] font-bold text-white ring-2 ring-white">
            2
          </span>
        </button>

        {/* User initials circle */}
        <div
          role="img"
          aria-label="Gursimran Singh"
          className="grid h-9 w-9 place-items-center rounded-full border border-[#E5E0D8] bg-[#EAE5DC] text-[13px] font-semibold text-[#171717] shadow-xs cursor-pointer hover:ring-2 hover:ring-[#A97843]/30 transition"
        >
          GS
        </div>
      </div>
    </header>
  );
}
