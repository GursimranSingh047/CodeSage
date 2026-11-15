import React, { useState } from "react";
import {
  Check,
  ArrowRight,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Finding, Patch, VerificationResult } from "@/types";
import { getFindingTitle, getFindingId } from "@/components/findings/FindingList";
import { clsx } from "clsx";

interface SuggestedFixTabProps {
  finding: Finding;
  patch?: Patch | null;
  verification?: VerificationResult | null;
  isScanning?: boolean;
  onReviewDecision?: (decision: "approved" | "rejected", notes?: string) => Promise<void>;
  className?: string;
}

export const SuggestedFixTab: React.FC<SuggestedFixTabProps> = ({
  finding,
  patch,
  onReviewDecision,
  className,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [localPatch, setLocalPatch] = useState<Patch | null>(patch || null);

  const filePath = finding.file_path || "src/api/users.py";
  const lineNum = finding.line_number || 142;
  const fixId = getFindingId(finding);
  const findingTitle = getFindingTitle(finding);
  const sev = (finding.severity?.toLowerCase() || "critical");

  const original =
    localPatch?.original_code ||
    patch?.original_code ||
    finding.code_snippet ||
    `def get_user():\n    user_id = request.args.get("id")\n    query = f"SELECT * FROM users WHERE id = {user_id}"\n    return db.execute(query)`;

  const remediated =
    localPatch?.patched_code ||
    patch?.patched_code ||
    (original.includes("os.system")
      ? original.replace(
          /os\.system\(.*?\)/,
          'subprocess.run(["echo", msg], check=False)'
        )
      : original.replace(
          /f"SELECT .*?"/,
          '"SELECT * FROM users WHERE id = ?", (user_id,)'
        ));

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setLocalPatch({
        finding_id: fixId,
        original_code: original,
        patched_code: remediated,
        explanation: "AI Synthesized secure AST parameterization",
        attempt_number: 1,
      });
      setIsGenerating(false);
    }, 1200);
  };

  return (
    <div
      className={clsx(
        "surface-card rounded-2xl p-6 sm:p-7 space-y-6 relative overflow-hidden select-none border border-[#292D2A]",
        className
      )}
    >
      {/* Top Header matching Reference 2 */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-[#292D2A]">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono font-medium tracking-wider text-[#8CFF8C]">
            <span>←</span>
            <span className="uppercase text-[11px]">AI REMEDIATION</span>
          </div>

          <h3 className="text-2xl sm:text-3xl font-sans font-extrabold text-[#F4F5F4] tracking-tight">
            Generate Secure Fix
          </h3>
          <p className="text-xs text-[#A5AAA6] font-sans">
            AI is creating a safe and minimal patch for the selected finding.
          </p>
        </div>

        {/* Right Badges */}
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-[#151716] border border-[#292D2A] text-xs font-mono text-[#F4F5F4]">
            {fixId} {findingTitle}
          </span>
          <span
            className={clsx(
              "px-3 py-1 rounded-full border text-xs font-mono font-semibold capitalize",
              sev === "critical"
                ? "bg-[#FF5555]/15 border-[#FF5555]/30 text-[#FF5555]"
                : "bg-[#FFB84D]/15 border-[#FFB84D]/30 text-[#FFB84D]"
            )}
          >
            {sev}
          </span>
        </div>
      </div>

      {/* Side-by-Side Comparison Blocks */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center font-mono">
        {/* Left: Vulnerable Code */}
        <div className="lg:col-span-5 rounded-xl bg-[#080909] border border-[#292D2A] p-4 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between text-[11px] text-[#A5AAA6] border-b border-[#292D2A] pb-2">
            <span>Vulnerable Code ({filePath}:{lineNum})</span>
            <span className="text-[#FF5555] font-semibold">-1</span>
          </div>

          <pre className="p-2.5 rounded bg-[#FF5555]/10 border-l-2 border-[#FF5555] text-[#FFA3A3] overflow-x-auto text-xs leading-relaxed whitespace-pre-wrap">
            {original}
          </pre>
        </div>

        {/* Center Arrow */}
        <div className="lg:col-span-2 flex items-center justify-center py-2 lg:py-0">
          <div className="w-8 h-8 rounded-full bg-[#151716] border border-[#292D2A] flex items-center justify-center text-[#8CFF8C]">
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>

        {/* Right: AI Generated Fix */}
        <div className="lg:col-span-5 rounded-xl bg-[#080909] border border-[#292D2A] p-4 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between text-[11px] text-[#8CFF8C] border-b border-[#292D2A] pb-2">
            <span className="font-semibold">AI Generated Fix</span>
            <span className="text-[#8CFF8C] font-semibold">+2</span>
          </div>

          {isGenerating ? (
            <div className="p-8 flex flex-col items-center justify-center text-center space-y-2 text-[#8CFF8C]">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-xs font-mono">Synthesizing patch...</span>
            </div>
          ) : (
            <pre className="p-2.5 rounded bg-[#8CFF8C]/10 border-l-2 border-[#8CFF8C] text-[#C2FFC2] overflow-x-auto text-xs leading-relaxed whitespace-pre-wrap">
              {remediated}
            </pre>
          )}
        </div>
      </div>

      {/* Bottom Bar: Status & Actions */}
      <div className="pt-3 border-t border-[#292D2A] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#16351F] border border-[#8CFF8C]/40 text-[#8CFF8C] font-mono text-xs font-semibold">
            <Check className="w-3.5 h-3.5 text-[#8CFF8C]" />
            Fix Ready
          </span>
          <span className="text-xs font-sans text-[#A5AAA6]">
            Replaced unvalidated code construct with secure parameterized AST pattern.
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {!localPatch && !patch ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleGenerate}
              loading={isGenerating}
              icon={<Sparkles className="w-3.5 h-3.5" />}
              className="font-sans font-bold text-xs"
            >
              Generate Fix
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onReviewDecision?.("approved")}
              className="font-sans font-bold text-xs"
            >
              Apply Patch
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
