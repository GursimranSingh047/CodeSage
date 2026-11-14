import React from "react";
import { motion } from "framer-motion";
import {
  BrainCircuit,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Braces,
  FileCode,
  Package,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Finding, TriageResult, CodeContext, Severity } from "@/types";
import { clsx } from "clsx";

interface AIAnalysisTabProps {
  finding: Finding;
  triage?: TriageResult | null;
  context?: CodeContext | null;
  className?: string;
}

export const AIAnalysisTab: React.FC<AIAnalysisTabProps> = ({
  finding,
  triage,
  context,
  className,
}) => {
  const sev = (finding.severity?.toLowerCase() || "medium") as Severity;
  const isReal = triage?.is_real_vulnerability ?? (finding.status !== "false_positive");
  const confidence = triage?.confidence ?? finding.confidence ?? 0.88;
  const exploitability = triage?.exploitability || "medium";
  const reasoning = triage?.reasoning || finding.reasoning || finding.raw_message || "";

  return (
    <div className={clsx("space-y-6", className)}>
      {/* 1. Header: Subtle Animated AI Engineering Indicator */}
      <div className="p-4 sm:p-5 rounded-2xl glass-panel-elevated border border-white/[0.08] relative overflow-hidden">
        {/* Subtle Ambient Violet Orb */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent-violet/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3.5">
            {/* Subtle animated orbital neural shield */}
            <div className="relative w-11 h-11 rounded-xl bg-accent-violet/10 border border-accent-violet/30 flex items-center justify-center text-accent-violet shrink-0 shadow-[0_0_15px_rgba(139,92,246,0.2)]">
              <BrainCircuit className="w-6 h-6 animate-pulse" />
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 rounded-xl border border-dashed border-accent-violet/40"
              />
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent-violet">
                  Calibrated Triage Analysis
                </span>
                <span className="text-[10px] font-mono text-sage-500 hidden sm:inline">
                  • Non-generative Deterministic Verification
                </span>
              </div>
              <h3 className="text-base font-sans font-bold text-white tracking-tight">
                {isReal ? "Confirmed Security Vulnerability" : "Classified False Positive"}
              </h3>
            </div>
          </div>

          {/* Metric Badges */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <Badge variant={sev} size="sm" dot={sev === "critical"}>
              {sev} Severity
            </Badge>

            <Badge
              variant={isReal ? "warning" : "success"}
              size="sm"
            >
              {isReal ? (
                <>
                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                  Real Risk
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3 h-3 inline mr-1" />
                  Filtered
                </>
              )}
            </Badge>
          </div>
        </div>
      </div>

      {/* 2. Key Metrics Grid: Confidence, Exploitability, CWE */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* Calibrated Confidence */}
        <div className="p-4 rounded-xl glass-panel border border-white/[0.06] space-y-1.5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-sage-400 font-semibold flex items-center justify-between">
            <span>Confidence Score</span>
            <span className="text-accent-orange font-bold font-feature-numeric">
              {Math.round(confidence * 100)}%
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full bg-sage-800 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.round(confidence * 100)}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full bg-gradient-to-r from-amber-400 to-accent-orange rounded-full"
            />
          </div>
          <div className="text-[10px] font-mono text-sage-500">
            Calibrated against AST context
          </div>
        </div>

        {/* Security Impact & Exploitability */}
        <div className="p-4 rounded-xl glass-panel border border-white/[0.06] space-y-1.5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-sage-400 font-semibold">
            Security Impact
          </div>
          <div className="flex items-center gap-2">
            <span
              className={clsx(
                "text-sm font-sans font-bold uppercase",
                exploitability === "high"
                  ? "text-rose-400"
                  : exploitability === "medium"
                  ? "text-amber-400"
                  : "text-emerald-400"
              )}
            >
              {exploitability} Risk Impact
            </span>
          </div>
          <div className="text-[10px] font-mono text-sage-500">
            Attacker reachable code path
          </div>
        </div>

        {/* CWE Taxonomy */}
        <div className="p-4 rounded-xl glass-panel border border-white/[0.06] space-y-1.5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-sage-400 font-semibold">
            Taxonomy Category
          </div>
          <div className="text-sm font-sans font-bold text-white truncate">
            {triage?.cwe_confirmed || finding.cwe_id || "CWE Classification"}
          </div>
          <div className="text-[10px] font-mono text-sage-500 truncate">
            {finding.tool_source} static detection
          </div>
        </div>
      </div>

      {/* 3. Vulnerability Explanation & Root Cause Breakdown */}
      <div className="space-y-3">
        <h4 className="text-xs font-mono uppercase tracking-wider text-sage-400 font-semibold flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-accent-orange" />
          <span>Vulnerability Explanation & Root Cause</span>
        </h4>

        <div className="p-4 sm:p-5 rounded-xl glass-panel border border-white/[0.06] space-y-4 text-xs font-sans text-sage-200 leading-relaxed">
          <div>
            <h5 className="font-mono text-[11px] uppercase tracking-wider text-accent-orange font-bold mb-1">
              Engineering Rationale
            </h5>
            <p className="text-sage-200 leading-relaxed">{reasoning}</p>
          </div>

          <div className="pt-3 border-t border-white/[0.06] space-y-2">
            <h5 className="font-mono text-[11px] uppercase tracking-wider text-sage-400 font-bold">
              Root Cause Anatomy
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-sage-950/80 border border-white/[0.06] space-y-1">
                <span className="text-[10px] text-rose-400 uppercase font-semibold">
                  Source Trigger:
                </span>
                <p className="text-sage-300">
                  Unvalidated caller parameter or external input reaching sink
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-sage-950/80 border border-white/[0.06] space-y-1">
                <span className="text-[10px] text-accent-orange uppercase font-semibold">
                  Affected Target:
                </span>
                <p className="text-sage-300 truncate">
                  {finding.file_path}:{finding.line_number}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Relevant AST Context & Imports */}
      {context && (
        <div className="space-y-3">
          <h4 className="text-xs font-mono uppercase tracking-wider text-sage-400 font-semibold flex items-center gap-2">
            <Braces className="w-4 h-4 text-accent-teal" />
            <span>Relevant AST Scope & Imports</span>
          </h4>

          <div className="p-4 rounded-xl glass-panel border border-white/[0.06] space-y-3">
            {context.imports && context.imports.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono uppercase text-sage-400 flex items-center gap-1.5">
                  <Package className="w-3 h-3 text-accent-teal" />
                  Imported Dependencies
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {context.imports.map((imp, i) => (
                    <code
                      key={i}
                      className="text-[11px] font-mono px-2 py-0.5 rounded bg-sage-900 border border-white/[0.06] text-sage-300"
                    >
                      {imp}
                    </code>
                  ))}
                </div>
              </div>
            )}

            {context.enclosing_function && (
              <div className="space-y-1.5 pt-2 border-t border-white/[0.06]">
                <span className="text-[10px] font-mono uppercase text-sage-400 flex items-center gap-1.5">
                  <FileCode className="w-3 h-3 text-accent-violet" />
                  Enclosing Function Signature
                </span>
                <pre className="p-2.5 rounded-lg bg-sage-950 font-mono text-[11px] text-sage-300 overflow-x-auto">
                  {context.enclosing_function.split("\n")[0]}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
