import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sun, Moon } from "lucide-react";
import { useTheme } from "../../theme";
import HeroNodeField from "../components/HeroNodeField";
import RotatingWord from "../components/RotatingWord";
import HowItWorks from "../components/HowItWorks";
import GitHubRepoScanner from "../../components/GitHubRepoScanner";

export default function LandingV2() {
  const { theme, toggle } = useTheme();

  return (
    <div className="relative min-h-screen overflow-hidden bg-void font-sans text-ink">
      {/* 3D node field behind the hero (decorative) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[820px]">
        <HeroNodeField />
      </div>

      {/* nav */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-2.5" aria-label="CodeSage home">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-mint font-display text-sm font-bold text-black">
            CS
          </span>
          <span className="font-display text-lg font-semibold">CodeSage</span>
        </Link>
        <nav className="hidden items-center gap-7 text-[13.5px] text-fog md:flex" aria-label="Primary">
          <span className="cursor-default transition-colors hover:text-ink" title="Placeholder">Security</span>
          <a href="#how-it-works" className="transition-colors hover:text-ink">How it Works</a>
          <span className="cursor-default transition-colors hover:text-ink" title="Placeholder">Pricing</span>
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
          <Link
            to="/login"
            className="rounded-lg border border-edge bg-surface px-4 py-2 text-[13px] font-semibold text-ink transition hover:border-edge-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint"
          >
            Log In
          </Link>
          <Link
            to="/signup"
            className="rounded-lg bg-mint px-4 py-2 text-[13px] font-bold text-black transition hover:bg-[#a5ffd0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint"
          >
            Get Started
          </Link>
        </div>
      </header>

      {/* hero */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-28 pt-24 text-center sm:pt-32">
        <p className="mb-5 font-mono text-[12px] uppercase tracking-[2.5px] text-mint/80">
          Agentic security auditing
        </p>
        <h1 className="font-display text-5xl font-bold leading-[1.08] tracking-tight sm:text-6xl md:text-7xl">
          Welcome to CodeSage.
          <br />
          <span className="text-fog">The future isn't fixing code alone. It's </span>
          <RotatingWord
            words={["reviewing it.", "securing it.", "prioritizing it.", "patching it."]}
            interval={2000}
          />
        </h1>
        <p className="mx-auto mt-7 max-w-2xl text-[16.5px] leading-relaxed text-fog">
          Autonomous AI agents that audit your codebase, generate verified fixes, and open pull
          requests — so nothing slips through unreviewed.
        </p>

        {/* GitHub Repository Scanner */}
        <div className="mx-auto mt-10 max-w-2xl text-left">
          <GitHubRepoScanner />
        </div>
      </section>

      {/* how it works */}
      <HowItWorks />

      {/* footer */}
      <footer className="relative z-10 border-t border-edge/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-[12.5px] text-dim">
          <span>⌘ CodeSage — autonomous security auditing</span>
          <span>Semgrep · Bandit · Gitleaks · LangGraph</span>
        </div>
      </footer>
    </div>
  );
}
