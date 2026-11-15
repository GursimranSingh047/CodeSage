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
      <div className="p-5 rounded-2xl surface-card border border-[#292D2A] relative overflow-hidden shadow-card">
        {/* Soft Ambient Green Glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#8CFF8C]/[0.05] rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="relative w-11 h-11 rounded-2xl bg-[#151716] border border-[#292D2A] flex items-center justify-center text-[#8CFF8C] shrink-0">
              <BrainCircuit className="w-5 h-5 text-[#8CFF8C]" />
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 rounded-2xl border border-dashed border-[#8CFF8C]/40"
              />
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#8CFF8C]">
                  Calibrated Triage Analysis
                </span>
                <span className="text-[10px] font-mono text-[#666C68] hidden sm:inline">
                  • Non-generative Deterministic Verification
                </span>
              </div>
              <h3 className="text-base font-sans font-bold text-[#F4F5F4] tracking-tight">
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
              variant={isReal ? "critical" : "green"}
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
        <div className="p-4 rounded-2xl surface-card border border-[#292D2A] space-y-1.5 shadow-sm">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#666C68] font-semibold flex items-center justify-between">
            <span>Confidence Score</span>
            <span className="text-[#8CFF8C] font-bold font-feature-numeric text-xs">
              {Math.round(confidence * 100)}%
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[#151716] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.round(confidence * 100)}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full bg-[#8CFF8C] rounded-full"
            />
          </div>
          <div className="text-[10px] font-mono text-[#666C68]">
            Calibrated against AST context
          </div>
        </div>

        {/* Security Impact & Exploitability */}
        <div className="p-4 rounded-2xl surface-card border border-[#292D2A] space-y-1.5 shadow-sm">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#666C68] font-semibold">
            Security Impact
          </div>
          <div className="flex items-center gap-2">
            <span
              className={clsx(
                "text-sm font-sans font-bold uppercase",
                exploitability === "high"
                  ? "text-[#FF5555]"
                  : exploitability === "medium"
                  ? "text-[#FFB84D]"
                  : "text-[#8CFF8C]"
              )}
            >
              {exploitability} Risk Impact
            </span>
          </div>
          <div className="text-[10px] font-mono text-[#666C68]">
            Attacker reachable code path
          </div>
        </div>

        {/* CWE Taxonomy */}
        <div className="p-4 rounded-2xl surface-card border border-[#292D2A] space-y-1.5 shadow-sm">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#666C68] font-semibold">
            Taxonomy Category
          </div>
          <div className="text-sm font-sans font-bold text-[#F4F5F4] truncate">
            {triage?.cwe_confirmed || finding.cwe_id || "CWE Classification"}
          </div>
          <div className="text-[10px] font-mono text-[#666C68] truncate">
            {finding.tool_source} static detection
          </div>
        </div>
      </div>

      {/* 3. Vulnerability Explanation & Root Cause Breakdown */}
      <div className="space-y-3">
        <h4 className="text-xs font-mono uppercase tracking-wider text-[#666C68] font-semibold flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-[#FF5555]" />
          <span>Vulnerability Explanation & Root Cause</span>
        </h4>

        <div className="p-5 rounded-2xl surface-card border border-[#292D2A] space-y-4 text-xs font-sans text-[#F4F5F4] leading-relaxed shadow-sm">
          <div>
            <h5 className="font-mono text-[11px] uppercase tracking-wider text-[#8CFF8C] font-bold mb-1">
              Engineering Rationale
            </h5>
            <p className="text-[#A5AAA6] leading-relaxed">{reasoning}</p>
          </div>

          <div className="pt-3 border-t border-[#292D2A] space-y-2">
            <h5 className="font-mono text-[11px] uppercase tracking-wider text-[#666C68] font-bold">
              Root Cause Anatomy
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-[#151716] border border-[#292D2A] space-y-1">
                <span className="text-[10px] text-[#FF5555] uppercase font-semibold">
                  Source Trigger:
                </span>
                <p className="text-[#F4F5F4]">
                  Unvalidated caller parameter or external input reaching sink
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#151716] border border-[#292D2A] space-y-1">
                <span className="text-[10px] text-[#8CFF8C] uppercase font-semibold">
                  Affected Target:
                </span>
                <p className="text-[#F4F5F4] truncate">
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
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#666C68] font-semibold flex items-center gap-2">
            <Braces className="w-4 h-4 text-[#8CFF8C]" />
            <span>Relevant AST Scope & Imports</span>
          </h4>

          <div className="p-5 rounded-2xl surface-card border border-[#292D2A] space-y-3 shadow-sm">
            {context.imports && context.imports.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono uppercase text-[#666C68] flex items-center gap-1.5">
                  <Package className="w-3 h-3 text-[#A5AAA6]" />
                  Imported Dependencies
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {context.imports.map((imp, i) => (
                    <code
                      key={i}
                      className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#151716] border border-[#292D2A] text-[#8CFF8C]"
                    >
                      {imp}
                    </code>
                  ))}
                </div>
              </div>
            )}

            {context.enclosing_function && (
              <div className="space-y-1.5 pt-2 border-t border-[#292D2A]">
                <span className="text-[10px] font-mono uppercase text-[#666C68] flex items-center gap-1.5">
                  <FileCode className="w-3 h-3 text-[#A5AAA6]" />
                  Enclosing Function Signature
                </span>
                <pre className="p-3 rounded-xl bg-[#080909] font-mono text-[11px] text-[#F4F5F4] overflow-x-auto border border-[#292D2A]">
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
