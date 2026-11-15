import React from "react";
import { ExternalLink, Check } from "lucide-react";
import { clsx } from "clsx";

interface ActiveScanCardProps {
  repoUrl?: string;
  branch?: string;
  progressPercent?: number;
  currentStage?: string;
  isScanning?: boolean;
  onNavigateToScan?: () => void;
}

export const ActiveScanCard: React.FC<ActiveScanCardProps> = ({
  repoUrl = "Repository",
  branch = "main",
  progressPercent = 67,
  currentStage = "Analyzing codebase...",
  isScanning = true,
  onNavigateToScan,
}) => {
  const stages = [
    { id: "ingest", label: "Ingest", status: "complete" },
    { id: "scan", label: "Scan", status: "complete" },
    { id: "context", label: "Context", status: "active" },
    { id: "triage", label: "Triage", status: "pending" },
    { id: "patch", label: "Patch", status: "pending" },
    { id: "verify", label: "Verify", status: "pending" },
    { id: "pr", label: "PR", status: "pending" },
  ];

  const cleanRepoName = repoUrl.replace("https://github.com/", "");

  return (
    <div
      onClick={onNavigateToScan}
      className="surface-card rounded-2xl p-5 space-y-4 hover:border-[#363C38] transition-all cursor-pointer relative overflow-hidden group select-none"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <h4 className="font-sans font-semibold text-sm text-[#F4F5F4] tracking-tight">
          Active Scan
        </h4>
        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#16351F] border border-[#8CFF8C]/35 text-[#8CFF8C] text-[11px] font-mono font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[#8CFF8C] animate-pulse" />
          <span>{isScanning ? "Scanning" : "Complete"}</span>
        </div>
      </div>

      {/* Target Repo Info */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-[#151716] border border-[#292D2A] flex items-center justify-center font-mono text-[10px] text-[#A5AAA6]">
            ⌘
          </div>
          <span className="font-mono text-xs font-semibold text-[#F4F5F4] hover:text-[#8CFF8C] transition-colors flex items-center gap-1">
            {cleanRepoName}
            <ExternalLink className="w-3 h-3 text-[#666C68]" />
          </span>
        </div>
        <p className="text-[11px] font-mono text-[#666C68] pl-7">
          {branch} &nbsp;|&nbsp; 12,416 LOC
        </p>
      </div>

      {/* Large Progress Display & Status */}
      <div className="pt-1 space-y-2">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-[#8CFF8C]">
              {progressPercent}%
            </span>
            <span className="text-xs font-sans text-[#A5AAA6]">
              {currentStage}
            </span>
          </div>
          <span className="text-xs font-mono text-[#666C68]">
            ETA: 00:42
          </span>
        </div>

        {/* Green Progress Bar */}
        <div className="w-full h-1.5 rounded-full bg-[#151716] overflow-hidden">
          <div
            className="h-full bg-[#8CFF8C] shadow-[0_0_8px_rgba(140,255,140,0.6)] transition-all duration-500 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Stepper (7 Stages) */}
      <div className="pt-2 flex items-center justify-between">
        {stages.map((stage, idx) => {
          const isComplete = stage.status === "complete";
          const isActive = stage.status === "active";
          return (
            <div key={stage.id} className="flex flex-col items-center gap-1.5 flex-1 relative">
              {/* Connector line between steps */}
              {idx > 0 && (
                <div
                  className={clsx(
                    "absolute top-2.5 -left-1/2 w-full h-[1px]",
                    isComplete ? "bg-[#8CFF8C]/50" : "bg-[#292D2A]"
                  )}
                />
              )}

              {/* Step indicator node */}
              <div
                className={clsx(
                  "w-5 h-5 rounded-full flex items-center justify-center relative z-10 font-mono text-[9px] transition-all",
                  isComplete
                    ? "bg-[#8CFF8C] text-[#080909] font-bold"
                    : isActive
                    ? "bg-[#16351F] border-2 border-[#8CFF8C] text-[#8CFF8C] shadow-[0_0_8px_rgba(140,255,140,0.4)]"
                    : "bg-[#151716] border border-[#292D2A] text-[#666C68]"
                )}
              >
                {isComplete ? (
                  <Check className="w-3 h-3 stroke-[3]" />
                ) : isActive ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#8CFF8C] animate-ping" />
                ) : null}
              </div>

              {/* Step label */}
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
