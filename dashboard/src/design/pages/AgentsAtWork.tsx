import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  Search, ScanSearch, FileCode, ShieldAlert, Wrench, CheckCircle2,
  GitPullRequest, Check, ChevronRight,
} from "lucide-react";
import { useScanFlow } from "../ScanFlowContext";
import type { AgentId } from "../types";

const STEPS: Array<{ id: AgentId; name: string; icon: typeof Search; result: string }> = [
  { id: "ingestion", name: "Ingestion Agent", icon: Search, result: "Cloned repository and detected language/framework" },
  { id: "scanning", name: "Scanning Agent", icon: ScanSearch, result: "Ran Semgrep, Bandit, and Gitleaks — found 6 raw findings" },
  { id: "context", name: "Context Agent", icon: FileCode, result: "Extracted function-level context for 6 findings" },
  { id: "triage", name: "Triage Agent", icon: ShieldAlert, result: "Classified findings — 4 confirmed real, 2 false positives filtered" },
  { id: "patch", name: "Patch Agent", icon: Wrench, result: "Generated fixes for 4 confirmed vulnerabilities" },
  { id: "verify", name: "Verification Agent", icon: CheckCircle2, result: "Verified 4 patches in sandbox — 4 passed, 0 needed retry" },
  { id: "pr", name: "PR Agent", icon: GitPullRequest, result: "Opened 1 pull request with the verified fixes" },
];

export default function AgentsAtWork() {
  const { run, flowPhase } = useScanFlow();
  const navigate = useNavigate();
  const allDone = flowPhase === "completed";

  // when every agent has finished, advance to the results dashboard
  useEffect(() => {
    if (!allDone) return;
    const t = setTimeout(() => navigate("/results"), 2600);
    return () => clearTimeout(t);
  }, [allDone, navigate]);

  const visible = STEPS.filter((s) => {
    const st = run.agents[s.id]?.status ?? "queued";
    return st !== "queued" && st !== "idle";
  });

  return (
    <div className="relative min-h-screen bg-void font-sans text-ink">
      <div className="grid-bg" aria-hidden />
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-mint font-display text-sm font-bold text-black">CS</span>
          <span className="font-display text-lg font-semibold">CodeSage</span>
        </div>
        <span className="notch-tr inline-flex items-center gap-1.5 border border-amber-brand/40 bg-amber-brand/10 px-4 py-1.5 text-[12px] font-semibold text-amber-brand">
          Demo Mode
        </span>
      </header>

      <div className="relative z-10 mx-auto max-w-3xl px-6 pb-20 pt-10 text-center">
        <p className="text-lg text-fog">Running Audit</p>
        <h1 className="font-display text-5xl font-bold tracking-tight sm:text-6xl">Agents at work</h1>
        <p className="mt-4 text-[15px] text-fog">
          A multi-agent security pipeline is cloning, scanning, triaging, and fixing{" "}
          <span className="font-mono text-ink">{run.repo}</span>.
        </p>
      </div>

      <div className="relative z-10 mx-auto max-w-3xl space-y-4 px-6 pb-24">
        {visible.map((step, idx) => {
          const agent = run.agents[step.id];
          const st = agent.status;
          const done = st === "success";
          const working = st === "working";
          const Icon = step.icon;
          const statusLine = working
            ? agent.latestActivity || agent.statusText
            : done
            ? step.result
            : agent.statusText;

          return (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="notch-tr bg-edge p-px"
            >
              <div className="notch-tr flex items-center gap-4 bg-surface px-5 py-5">
                <span className="relative shrink-0">
                  <span
                    className={`grid h-12 w-12 place-items-center rounded-full border border-edge bg-[#0c0f0c] ${
                      working ? "cs-pulse text-mint" : "text-fog"
                    }`}
                  >
                    {working ? <Icon size={19} className="cs-spin" /> : <Icon size={19} />}
                  </span>
                  {done && (
                    <span
                      className="absolute -right-0.5 -top-0.5 grid h-5 w-5 place-items-center rounded-full bg-mint text-black"
                      aria-label="completed"
                    >
                      <Check size={12} strokeWidth={3.5} />
                    </span>
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="font-display text-lg font-semibold text-ink">{step.name}</h2>
                    <span className="notch-tr inline-flex bg-mint px-3.5 py-1 text-[11.5px] font-bold text-black">
                      Step {idx + 1}
                    </span>
                  </div>
                  <p className={`mt-1 truncate text-[13.5px] ${done ? "text-fog" : "text-mint"}`}>
                    {statusLine}
                  </p>
                </div>

                {done && flowPhase === "completed" && (
                  <ChevronRight size={16} className="shrink-0 text-dim" aria-hidden />
                )}
              </div>
            </motion.div>
          );
        })}

        {allDone && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center pt-6"
          >
            <button
              type="button"
              onClick={() => navigate("/results")}
              className="notch-tr inline-flex items-center gap-2 bg-mint px-7 py-3 text-[14px] font-bold text-black transition hover:bg-[#a5ffd0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint"
            >
              View Security Summary <ChevronRight size={16} />
            </button>
          </motion.div>
        )}

        {!allDone && flowPhase === "running" && (
          <p className="pt-2 text-center text-[12.5px] text-dim">
            Findings appear here as each agent completes — the summary unlocks at the end of the run.
          </p>
        )}
      </div>
    </div>
  );
}
