import React from "react";
import { motion } from "framer-motion";
import {
  FileCode,
  Radar,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Finding, Severity } from "@/types";
import { clsx } from "clsx";

interface FindingListProps {
  findings: Finding[];
  selectedFindingId?: string | null;
  onSelectFinding: (finding: Finding) => void;
  className?: string;
}

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  informational: 0,
  info: 0,
};

export function getFindingId(f: Finding): string {
  return f.finding_id || f.id || "finding";
}

export function getFindingTitle(f: Finding): string {
  if (f.cwe_id && f.cwe_id.trim()) {
    return f.cwe_id;
  }
  if (f.raw_message && f.raw_message.trim()) {
    // Truncate first sentence
    const firstSentence = f.raw_message.split(".")[0];
    return firstSentence.length > 70 ? firstSentence.slice(0, 70) + "..." : firstSentence;
  }
  return "Security Finding";
}

export const FindingList: React.FC<FindingListProps> = ({
  findings,
  selectedFindingId,
  onSelectFinding,
  className,
}) => {
  // Sort findings by severity hierarchy
  const sortedFindings = [...findings].sort((a, b) => {
    const weightA = SEVERITY_WEIGHT[a.severity?.toLowerCase()] ?? 1;
    const weightB = SEVERITY_WEIGHT[b.severity?.toLowerCase()] ?? 1;
    if (weightB !== weightA) return weightB - weightA;
    return (a.file_path || "").localeCompare(b.file_path || "");
  });

  if (findings.length === 0) {
    return (
      <div className="p-12 text-center rounded-2xl glass-panel border border-white/[0.06] space-y-3">
        <div className="w-10 h-10 rounded-xl bg-sage-900 border border-white/[0.08] flex items-center justify-center text-sage-500 mx-auto">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <h4 className="text-sm font-sans font-semibold text-white">
          No Findings Found
        </h4>
        <p className="text-xs text-sage-400 font-sans max-w-xs mx-auto">
          No security findings match the active search and filter criteria.
        </p>
      </div>
    );
  }

  return (
    <div className={clsx("space-y-2.5 overflow-y-auto max-h-[720px] pr-1", className)}>
      {sortedFindings.map((finding) => {
        const fid = getFindingId(finding);
        const isSelected = selectedFindingId === fid;
        const sev = (finding.severity?.toLowerCase() || "medium") as Severity;
        const title = getFindingTitle(finding);

        return (
          <motion.div
            key={fid}
            whileHover={{ x: 2 }}
            transition={{ duration: 0.15 }}
          >
            <div
              onClick={() => onSelectFinding(finding)}
              className={clsx(
                "p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer relative select-none group",
                isSelected
                  ? "bg-sage-900/95 border-accent-orange/40 shadow-[0_4px_20px_rgba(249,115,22,0.12)] border-l-4 border-l-accent-orange"
                  : "bg-sage-900/60 border-white/[0.06] hover:bg-sage-900/80 hover:border-white/[0.12]"
              )}
            >
              {/* Header: Severity + Scanner + Status */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant={sev} size="xs" dot={sev === "critical"}>
                    {sev}
                  </Badge>

                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-sage-400 bg-sage-950/80 border border-white/[0.06]">
                    <Radar className="w-2.5 h-2.5 text-accent-teal" />
                    {finding.tool_source}
                  </span>
                </div>

                {finding.status && (
                  <span
                    className={clsx(
                      "text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded font-medium",
                      finding.status === "false_positive"
                        ? "bg-sage-950 text-sage-400 border border-white/[0.06]"
                        : finding.status.includes("verified")
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : finding.status === "needs_human_review"
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        : "bg-sage-850 text-sage-300 border border-white/[0.06]"
                    )}
                  >
                    {finding.status === "false_positive" ? "Filtered FP" : finding.status}
                  </span>
                )}
              </div>

              {/* Title / Description */}
              <h4 className="text-xs sm:text-sm font-sans font-semibold text-white tracking-tight line-clamp-1 group-hover:text-accent-orange transition-colors mb-1.5">
                {title}
              </h4>

              {/* File & Line Location */}
              <div className="flex items-center justify-between text-xs font-mono text-sage-400 pt-1">
                <span className="flex items-center gap-1.5 truncate max-w-[260px] text-[11px] text-sage-300">
                  <FileCode className="w-3.5 h-3.5 text-sage-500 shrink-0" />
                  <span className="truncate">{finding.file_path}</span>
                  <span className="text-accent-orange font-semibold shrink-0">
                    :{finding.line_number}
                  </span>
                </span>

                <span className="text-[10px] text-sage-500 truncate max-w-[120px] hidden sm:inline">
                  #{fid.split(":").slice(-1)[0] || fid.slice(0, 10)}
                </span>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};
