import React from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../../theme";
import { useScanFlow } from "../ScanFlowContext";
import NotchedButton from "./NotchedButton";

export default function TopNavigation() {
  const { theme, toggle } = useTheme();
  const { flowPhase } = useScanFlow();
  const navigate = useNavigate();
  const authed = localStorage.getItem("codesage_auth");
  const email = authed ? (JSON.parse(authed)?.email as string) ?? "user" : "guest";

  const pills: Array<[string, string]> =
    flowPhase === "completed"
      ? [
          ["Dashboard", "/results"],
          ["Findings", "/findings"],
          ["Patches", "/patches"],
          ["Pipeline", "/pipeline"],
        ]
      : [["Pipeline", "/pipeline"]];

  const pill = (to: string, label: string) => (
    <NavLink
      key={to}
      to={to}
      className={({ isActive }) =>
        [
          "notch-tr px-4 py-1.5 text-[12.5px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint",
          isActive ? "bg-mint text-black" : "border border-edge bg-[#0f120f] text-fog hover:text-ink",
        ].join(" ")
      }
    >
      {label}
    </NavLink>
  );

  return (
    <>
      <header className="relative z-20 border-b border-edge/60 bg-void/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5" aria-label="CodeSage home">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-mint font-display text-sm font-bold text-black">
              CS
            </span>
            <span className="font-display text-lg font-semibold">CodeSage</span>
          </Link>

          <nav className="flex flex-wrap items-center gap-2.5" aria-label="Primary">
            {pills.map(([to, label]) => pill(to, label))}
          </nav>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              className="grid h-9 w-9 place-items-center rounded-full bg-raised text-fog transition hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint"
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <span className="hidden text-[12px] text-dim sm:inline">{email}</span>
            {authed ? (
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem("codesage_auth");
                  navigate("/login");
                }}
                className="notch-tr inline-flex bg-mint px-5 py-2 text-[13px] font-semibold text-black transition hover:bg-[#a5ffd0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint"
              >
                Sign Out
              </button>
            ) : (
              <Link
                to="/login"
                className="notch-tr inline-flex bg-mint px-5 py-2 text-[13px] font-semibold text-black transition hover:bg-[#a5ffd0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint"
              >
                Sign In
              </Link>
            )}
            <NotchedButton corner="top-left" onClick={() => navigate("/")}>
              New Audit
            </NotchedButton>
          </div>
        </div>
      </header>
    </>
  );
}
