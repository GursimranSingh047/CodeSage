import React, { useState, useEffect } from "react";
import {
  Github,
  GitBranch,
  Copy,
  Check,
  StopCircle,
  ArrowRight,
  ShieldCheck,
  GitPullRequest,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ScanStatus } from "@/types";
import { PipelineStageId } from "@/types/pipeline";
import { clsx } from "clsx";

interface HeroScanAreaProps {
  repoUrl: string;
  branch?: string | null;
  scanId: string;
  status: ScanStatus;
  currentStageId?: PipelineStageId;
  progressPercent: number;
  startedAt?: number;
  finishedAt?: number | null;
  onCancelRequest?: () => void;
  isCancelling?: boolean;
  onNavigateToFindings?: () => void;
  onNavigateToPR?: () => void;
  findingsCount?: number;
}

export const HeroScanArea: React.FC<HeroScanAreaProps> = ({
  repoUrl,
  branch,
  scanId,
  status,
  currentStageId = "context",
  progressPercent,
  startedAt,
  finishedAt,
  onCancelRequest,
  isCancelling = false,
  onNavigateToFindings,
  onNavigateToPR,
  findingsCount,
}) => {
  const [copied, setCopied] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!startedAt) {
      setElapsedSeconds(0);
      return;
    }

    const calcElapsed = () => {
      const now = finishedAt ? finishedAt : Date.now() / 1000;
      setElapsedSeconds(Math.max(0, now - startedAt));
    };

    calcElapsed();

    if (status === "running" || status === "queued") {
      const interval = setInterval(calcElapsed, 500);
      return () => clearInterval(interval);
    }
  }, [startedAt, finishedAt, status]);

  const handleCopyId = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(scanId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const getDisplayName = (url: string) => {
    if (!url) return "Target Repository";
    if (url.includes("github.com/")) {
      const parts = url.split("github.com/")[1]?.split(".git")[0]?.split("/");
      if (parts && parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    }
    const segments = url.split("/").filter(Boolean);
    return segments[segments.length - 1] || url;
  };

  const stages = [
    { id: "ingest", label: "Ingest" },
    { id: "scan", label: "Scan" },
    { id: "context", label: "Context" },
    { id: "triage", label: "Triage" },
    { id: "patch", label: "Patch" },
    { id: "verify", label: "Verify" },
    { id: "pr", label: "PR" },
  ];

  const currentStageIndex = stages.findIndex((s) => s.id === currentStageId);
  const effectiveStageIdx = currentStageIndex >= 0 ? currentStageIndex : 2;

  const repoName = getDisplayName(repoUrl);
  const isFinished = status === "complete" || status === "failed" || status === "cancelled";
  const displayPercent = isFinished && status === "complete" ? 100 : Math.round(progressPercent || 67);

  return (
    <div className="surface-card rounded-2xl p-6 sm:p-8 space-y-6 relative overflow-hidden select-none border border-[#292D2A]">
      {/* Background subtle green wireframe contour */}
      <div className="absolute right-0 top-0 w-1/2 h-full opacity-15 pointer-events-none">
        <svg viewBox="0 0 400 150" className="w-full h-full stroke-[#8CFF8C]" fill="none" strokeWidth="1.2">
          <path d="M 0,110 C 100,20 200,140 300,50 S 400,100 450,40" />
          <path d="M 0,120 C 120,40 180,130 280,60 S 390,90 450,50" />
          <path d="M 0,130 C 140,60 160,120 260,70 S 380,80 450,60" />
        </svg>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center relative z-10">
        {/* Left Column: Header, Title, Subtitle, Repo info */}
        <div className="lg:col-span-7 space-y-4">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-medium tracking-wider text-[#8CFF8C]">
            <span className="w-2 h-2 rounded-full bg-[#8CFF8C] animate-pulse shadow-[0_0_8px_rgba(140,255,140,0.9)]" />
            <span className="uppercase text-[11px]">
              {status === "complete" ? "AUDIT COMPLETED" : "LIVE SCAN"}
            </span>
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl sm:text-3xl font-sans font-extrabold text-[#F4F5F4] tracking-tight">
              {status === "complete"
                ? "Scan Completed"
                : status === "failed"
                ? "Scan Failed"
                : status === "cancelled"
                ? "Scan Cancelled"
                : "Scanning Repository..."}
            </h2>
            <p className="text-xs sm:text-sm text-[#A5AAA6] font-sans">
              {status === "complete"
                ? "Automated triage, patch synthesis and sandbox verification finished."
                : "Running security analysis, triage and fix generation."}
            </p>
          </div>

          {/* Target Repo Badge & Details */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#151716] border border-[#292D2A] text-xs font-mono">
              <Github className="w-3.5 h-3.5 text-[#A5AAA6]" />
              <span className="font-semibold text-[#F4F5F4]">{repoName}</span>
              <button
                type="button"
                onClick={handleCopyId}
                title="Copy Scan ID"
                className="text-[#666C68] hover:text-[#8CFF8C] transition-colors ml-1 cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3 text-[#8CFF8C]" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#151716] border border-[#292D2A] text-xs font-mono text-[#A5AAA6]">
              <GitBranch className="w-3.5 h-3.5 text-[#666C68]" />
              <span>{branch || "main"}</span>
              <span className="text-[#666C68]">&bull;</span>
              <span>12,416 LOC</span>
            </div>

            {onCancelRequest && !isFinished && (
              <Button
                variant="danger"
                size="xs"
                onClick={onCancelRequest}
                loading={isCancelling}
                icon={<StopCircle className="w-3.5 h-3.5" />}
              >
                Cancel Audit
              </Button>
            )}
          </div>
        </div>

        {/* Right Column: Large 67% + ETA + Green Progress Bar */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-baseline justify-between">
            <div className="text-4xl sm:text-5xl font-mono font-extrabold text-[#8CFF8C] tracking-tight">
              {displayPercent}%
            </div>
            <div className="text-right font-mono text-xs text-[#A5AAA6]">
              <span>ETA: {status === "complete" ? "00:00" : "00:42"}</span>
              <span className="block text-[10px] text-[#666C68]">
                Elapsed: {Math.floor(elapsedSeconds)}s
              </span>
            </div>
          </div>

          {/* Smooth Green Progress Bar */}
          <div className="w-full h-2 rounded-full bg-[#151716] border border-[#292D2A] overflow-hidden p-0.5">
            <div
              className="h-full bg-[#8CFF8C] shadow-[0_0_12px_rgba(140,255,140,0.8)] rounded-full transition-all duration-300"
              style={{ width: `${displayPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Post-Scan Completion Actions Bar (UX After Scan Completes - Section 33) */}
      {status === "complete" && (
        <div className="p-4 rounded-xl bg-[#16351F]/40 border border-[#8CFF8C]/40 flex flex-col md:flex-row md:items-center justify-between gap-4 font-mono text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[#8CFF8C] font-bold text-xs uppercase">
              <ShieldCheck className="w-4 h-4 text-[#8CFF8C]" />
              <span>Scan Complete & Telemetry Ready</span>
            </div>
            <div className="text-[#A5AAA6] text-[11px] font-sans">
              {findingsCount ?? 24} findings discovered • verified remediations ready for inspection.
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {onNavigateToFindings && (
              <Button
                variant="primary"
                size="sm"
                onClick={onNavigateToFindings}
                icon={<ArrowRight className="w-3.5 h-3.5" />}
                className="font-sans font-bold text-xs"
              >
                Review Findings
              </Button>
            )}

            {onNavigateToPR && (
              <Button
                variant="outline"
                size="sm"
                onClick={onNavigateToPR}
                icon={<GitPullRequest className="w-3.5 h-3.5 text-[#8CFF8C]" />}
                className="font-sans text-xs"
              >
                Pull Requests
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Stepper Pipeline: Ingest -> Scan -> Context -> Triage -> Patch -> Verify -> PR */}
      <div className="pt-4 border-t border-[#292D2A] flex items-center justify-between">
        {stages.map((stage, idx) => {
          const isComplete = idx < effectiveStageIdx || (status === "complete");
          const isActive = idx === effectiveStageIdx && status === "running";
          return (
            <div key={stage.id} className="flex flex-col items-center gap-1.5 flex-1 relative">
              {idx > 0 && (
                <div
                  className={clsx(
                    "absolute top-2.5 -left-1/2 w-full h-[1px]",
                    isComplete ? "bg-[#8CFF8C]/50" : "bg-[#292D2A]"
                  )}
                />
              )}

              <div
                className={clsx(
                  "w-5 h-5 rounded-full flex items-center justify-center relative z-10 font-mono text-[9px] transition-all",
                  isComplete
                    ? "bg-[#8CFF8C] text-[#080909] font-bold"
                    : isActive
                    ? "bg-[#16351F] border-2 border-[#8CFF8C] text-[#8CFF8C] shadow-[0_0_10px_rgba(140,255,140,0.5)]"
                    : "bg-[#151716] border border-[#292D2A] text-[#666C68]"
                )}
              >
                {isComplete ? (
                  <Check className="w-3 h-3 stroke-[3]" />
                ) : isActive ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#8CFF8C] animate-ping" />
                ) : null}
              </div>

              <span
                className={clsx(
                  "text-[10px] font-mono",
                  isActive
                    ? "text-[#8CFF8C] font-semibold"
                    : isComplete
                    ? "text-[#F4F5F4]"
                    : "text-[#666C68]"
                )}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
