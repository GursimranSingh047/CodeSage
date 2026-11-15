import React from "react";
import { Badge } from "@/components/ui/Badge";
import { Finding, Severity } from "@/types";
import { clsx } from "clsx";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { getSecurityAnalysisDetails } from "@/utils/securityDetails";

interface FindingListProps {
  findings: Finding[];
  selectedFindingId?: string | null;
  onSelectFinding: (finding: Finding) => void;
  className?: string;
}

export function getFindingId(f: Finding): string {
  return f.finding_id || f.id || "finding";
}

export function getFindingDisplayId(f: Finding, index?: number): string {
  if (f.display_id) return f.display_id;
  const fid = getFindingId(f);
  if (fid.startsWith("F-")) return fid;
  if (index !== undefined) return `F-${String(index + 1).padStart(3, "0")}`;
  return `F-${fid.slice(0, 4).toUpperCase()}`;
}

export function getFindingTitle(f: Finding): string {
  const details = getSecurityAnalysisDetails(f);
  if (details.title && !details.title.includes("Unclassified")) {
    return details.title;
  }
  if (f.cwe_id && f.cwe_id.trim()) {
    if (f.cwe_id.includes("89")) return "SQL Injection";
    if (f.cwe_id.includes("78")) return "OS Command Injection";
    if (f.cwe_id.includes("798")) return "Hardcoded Secret";
    if (f.cwe_id.includes("502")) return "Insecure Deserialization";
    if (f.cwe_id.includes("79")) return "XSS (Cross-Site Scripting)";
    if (f.cwe_id.includes("20")) return "Improper Input Validation";
    if (f.cwe_id.includes("94")) return "Code Injection / Debug Mode";
    return f.cwe_id;
  }
  if (f.raw_message && f.raw_message.trim()) {
    const firstSentence = f.raw_message.split(".")[0];
    return firstSentence.length > 55 ? firstSentence.slice(0, 55) + "..." : firstSentence;
  }
  return "Security Finding";
}

export function getFindingRule(f: Finding): string {
  if (f.cwe_id) {
    return f.cwe_id;
  }
  if (f.finding_id?.includes(":")) {
    const parts = f.finding_id.split(":");
    return parts[parts.length - 1];
  }
  return f.tool_source || "static-rule";
}

export function getStatusBadgeInfo(status?: string): {
  label: string;
  variant: "default" | "green" | "critical" | "warning" | "neutral";
  dot?: boolean;
} {
  switch (status) {
    case "discovered":
      return { label: "Open", variant: "default" };
    case "triaged_real":
      return { label: "Triaged", variant: "warning", dot: true };
    case "false_positive":
      return { label: "False Positive", variant: "neutral" };
    case "patch_generated":
      return { label: "Fix Generated", variant: "green" };
    case "verified_pr_opened":
      return { label: "PR Created", variant: "green", dot: true };
    case "verified_pr_skipped":
      return { label: "Verified", variant: "green" };
    case "verification_failed":
      return { label: "Verification Failed", variant: "critical" };
    case "needs_human_review":
      return { label: "Needs Review", variant: "warning", dot: true };
    case "pr_failed":
      return { label: "PR Failed", variant: "critical" };
    case "resolved":
      return { label: "Resolved", variant: "green" };
    default:
      return { label: status || "Open", variant: "default" };
  }
}

export const FindingList: React.FC<FindingListProps> = ({
  findings,
  selectedFindingId,
  onSelectFinding,
  className,
}) => {
  if (findings.length === 0) {
    return (
      <div
        className={clsx(
          "surface-card rounded-2xl border border-[#292D2A] p-10 text-center select-none bg-[#101211]",
          className
        )}
      >
        <div className="w-12 h-12 rounded-full bg-[#16351F] border border-[#8CFF8C]/30 text-[#8CFF8C] flex items-center justify-center mx-auto mb-3 shadow-[0_0_16px_rgba(140,255,140,0.15)]">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h3 className="font-sans font-bold text-sm text-[#F4F5F4]">
          No Security Findings Discovered
        </h3>
        <p className="text-xs text-[#A5AAA6] mt-1.5 max-w-sm mx-auto font-sans leading-relaxed">
          No vulnerabilities or code defects were detected for the current scan filter.
        </p>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "surface-card rounded-2xl border border-[#292D2A] overflow-hidden select-none",
        className
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#292D2A] text-[#666C68] text-[11px] uppercase tracking-wider bg-[#080909]/60">
              <th className="py-3 px-4 font-semibold w-20">#</th>
              <th className="py-3 px-3 font-semibold w-24">Severity</th>
              <th className="py-3 px-4 font-semibold">Finding / CWE</th>
              <th className="py-3 px-4 font-semibold">Location</th>
              <th className="py-3 px-3 font-semibold w-24 text-center">Confidence</th>
              <th className="py-3 px-4 font-semibold w-28 text-right">Status</th>
              <th className="py-3 px-4 font-semibold w-24 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#292D2A]">
            {findings.map((finding, idx) => {
              const fid = getFindingId(finding);
              const displayId = getFindingDisplayId(finding, idx);
              const isSelected = selectedFindingId === fid;
              const sev = (finding.severity?.toLowerCase() || "medium") as Severity;
              const title = getFindingTitle(finding);
              const rule = getFindingRule(finding);
              const location = `${finding.file_path || "src/api/app.py"}:${finding.line_number || 142}`;
              const confidence = finding.confidence ?? 0.9;
              const statusBadge = getStatusBadgeInfo(finding.status);

              return (
                <tr
                  key={fid}
                  onClick={() => onSelectFinding(finding)}
                  className={clsx(
                    "cursor-pointer transition-colors group",
                    isSelected
                      ? "bg-[#151716] border-l-2 border-l-[#8CFF8C]"
                      : "hover:bg-[#151716]/60"
                  )}
                >
                  {/* # ID */}
                  <td className="py-3 px-4 font-mono text-[#8CFF8C] font-semibold text-xs whitespace-nowrap">
                    {displayId}
                  </td>

                  {/* Severity Badge */}
                  <td className="py-3 px-3 whitespace-nowrap">
                    <Badge variant={sev} size="xs" dot={sev === "critical"}>
                      {finding.severity?.toUpperCase() || "CRITICAL"}
                    </Badge>
                  </td>

                  {/* Finding Title & Rule */}
                  <td className="py-3 px-4">
                    <div className="font-sans text-[#F4F5F4] font-semibold text-xs group-hover:text-white transition-colors truncate max-w-[220px]">
                      {title}
                    </div>
                    <div className="text-[10px] font-mono text-[#666C68] flex items-center gap-1.5 pt-0.5 truncate max-w-[220px]">
                      <span className="text-[#8CFF8C] font-medium">{rule}</span>
                      <span>•</span>
                      <span className="text-[#A5AAA6]">{finding.tool_source || "semgrep"}</span>
                    </div>
                  </td>

                  {/* Location (file:line) */}
                  <td className="py-3 px-4 font-mono text-[#A5AAA6] text-[11px] whitespace-nowrap">
                    {location}
                  </td>

                  {/* Confidence */}
                  <td className="py-3 px-3 text-center whitespace-nowrap">
                    <span className="font-mono text-xs font-semibold text-[#8CFF8C]">
                      {Math.round(confidence * 100)}%
                    </span>
                  </td>

                  {/* Status Badge */}
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <Badge variant={statusBadge.variant} size="xs" dot={statusBadge.dot}>
                      {statusBadge.label}
                    </Badge>
                  </td>

                  {/* View Action */}
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-[#A5AAA6] group-hover:text-[#8CFF8C] transition-colors">
                      <span>View</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
