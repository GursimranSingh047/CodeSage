import React, { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

type Step = {
  num: string;
  title: string;
  blurb: string;
  preview: React.ReactNode;
};

const DIFF_LINES: Array<[string, string]> = [
  ["-", 'query = f"SELECT * FROM products WHERE name LIKE \'%{q}%\'"'],
  ["+", 'query = "SELECT * FROM products WHERE name LIKE ?"'],
  ["+", "params = (f'%{q}%',)"],
  [" ", "rows = conn.execute(query).fetchall()"],
  ["+", "rows = conn.execute(query, params).fetchall()"],
];

const STEPS: Step[] = [
  {
    num: "01",
    title: "Scan",
    blurb: "Semgrep, Bandit and Gitleaks sweep every file in parallel.",
    preview: (
      <div className="space-y-3 font-mono text-[12.5px]">
        <div className="flex items-center justify-between rounded-lg border border-edge bg-raised px-4 py-3">
          <span className="text-ink">shopfast-api @ 3d5e0d2</span>
          <span className="text-emerald-brand">1,248 files indexed</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Semgrep", "6 findings"],
            ["Bandit", "11 findings"],
            ["Gitleaks", "2 secrets"],
          ].map(([tool, n]) => (
            <div key={tool} className="rounded-lg border border-edge bg-raised px-3 py-2.5">
              <p className="text-[11px] text-dim">{tool}</p>
              <p className="text-[13px] font-semibold text-ink">{n}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    num: "02",
    title: "Triage",
    blurb: "An LLM reviews every finding with its surrounding code — real issues vs noise.",
    preview: (
      <div className="space-y-2.5">
        {[
          ["HIGH", "SQL injection in product search", "Confirmed — 94%"],
          ["MEDIUM", "Hardcoded credential in fixture", "Confirmed — 88%"],
          ["LOW", "Assert used in test", "False positive — filtered"],
        ].map(([sev, title, verdict]) => (
          <div key={title} className="flex items-center justify-between rounded-lg border border-edge bg-raised px-4 py-2.5">
            <span className="text-[12.5px] text-ink">{title}</span>
            <span className={verdict.startsWith("Confirmed") ? "text-[11.5px] text-amber-brand" : "text-[11.5px] text-dim"}>
              {verdict}
            </span>
            <span className="rounded border border-edge px-1.5 py-0.5 text-[10.5px] font-semibold text-fog">{sev}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    num: "03",
    title: "Patch",
    blurb: "Confirmed findings get a minimal, behavior-preserving secure rewrite.",
    preview: (
      <div className="overflow-hidden rounded-lg border border-edge">
        <div className="border-b border-edge bg-raised px-4 py-2 font-mono text-[11px] text-fog">
          src/api/recommendations.ts
        </div>
        <pre className="space-y-0.5 p-4 font-mono text-[12px] leading-relaxed">
          {DIFF_LINES.map(([sign, code], i) => (
            <div
              key={i}
              className={
                sign === "+" ? "bg-emerald-brand/10 text-emerald-brand" :
                sign === "-" ? "bg-red-brand/10 text-red-brand" : "text-fog"
              }
            >
              {sign === "+" ? "+ " : sign === "-" ? "- " : "  "}
              {code}
            </div>
          ))}
        </pre>
      </div>
    ),
  },
  {
    num: "04",
    title: "Verify & Ship",
    blurb: "Every patch is re-scanned and test-run in a sandbox, then opened as a PR.",
    preview: (
      <div className="rounded-lg border border-edge bg-raised p-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-ink">Fix 4 verified vulnerabilities</span>
          <span className="rounded-full bg-emerald-brand/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-brand">Open</span>
        </div>
        <p className="mt-1 font-mono text-[11.5px] text-dim">shopfast-api #48 · 4 files</p>
        <div className="mt-3 space-y-1.5">
          {["Re-scan clean for all 4 patches", "Test suite green (15 passed)", "Awaiting human review"].map((c) => (
            <div key={c} className="flex items-center gap-2 text-[12px] text-fog">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-brand" aria-hidden />
              {c}
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

export default function HowItWorks() {
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();
  const step = STEPS[active];

  return (
    <section id="how-it-works" className="relative mx-auto max-w-6xl px-6 pb-24">
      <div className="overflow-hidden rounded-2xl border border-edge bg-surface">
        {/* tab strip */}
        <div className="flex border-b border-edge">
          {STEPS.map((s, i) => (
            <button
              key={s.num}
              type="button"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              aria-selected={active === i}
              role="tab"
              className={`relative flex-1 bg-surface px-4 py-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint ${
                active === i ? "bg-raised" : "hover:bg-overlay"
              }`}
            >
              <span className="flex items-baseline gap-2">
                <span className={`text-[11px] ${active === i ? "text-mint" : "text-dim"}`}>{s.num}</span>
                <span className={`text-[14px] font-semibold ${active === i ? "text-ink" : "text-fog"}`}>{s.title}</span>
                <span className={`hidden text-[13px] text-fog md:inline ${i === active ? "" : "opacity-0 md:opacity-100"}`}>
                  {s.blurb}
                </span>
              </span>
              {active === i && (
                <motion.span
                  layoutId="hiw-underline"
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-mint"
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 45 }}
                />
              )}
            </button>
          ))}
        </div>

        {/* preview panel */}
        <div className="p-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              {step.preview}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
