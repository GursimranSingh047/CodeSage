import React from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FolderDown,
  Radar,
  Braces,
  BrainCircuit,
  Wrench,
  ShieldCheck,
  GitPullRequest,
  Loader2,
} from "lucide-react";
import { PIPELINE_STAGES, PipelineStageId, StageStatus } from "@/types/pipeline";
import { clsx } from "clsx";

interface PipelineVisualizerProps {
  currentStageId?: PipelineStageId;
  stageStatuses: Record<PipelineStageId, StageStatus>;
  className?: string;
}

const STAGE_ICONS: Record<PipelineStageId, React.ReactNode> = {
  ingestion: <FolderDown className="w-4 h-4" />,
  scanning: <Radar className="w-4 h-4" />,
  context: <Braces className="w-4 h-4" />,
  triage: <BrainCircuit className="w-4 h-4" />,
  patch: <Wrench className="w-4 h-4" />,
  verify: <ShieldCheck className="w-4 h-4" />,
  pr: <GitPullRequest className="w-4 h-4" />,
};

export const PipelineVisualizer: React.FC<PipelineVisualizerProps> = ({
  stageStatuses,
  className,
}) => {
  return (
    <div className={clsx("surface-card rounded-2xl p-6 sm:p-7 border border-[#292D2A]", className)}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#292D2A] mb-5 gap-3">
        <div>
          <h3 className="text-sm font-sans font-bold text-[#F4F5F4] tracking-tight">
            Autonomous Pipeline Orchestration
          </h3>
          <p className="text-xs text-[#A5AAA6] font-sans mt-0.5">
            Real-time execution across 7 specialized engineering stages.
          </p>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-mono text-[#666C68]">
          <span className="flex items-center gap-1.5 text-[#F4F5F4]">
            <span className="w-2 h-2 rounded-full bg-[#8CFF8C]" /> Done
          </span>
          <span className="flex items-center gap-1.5 text-[#8CFF8C]">
            <span className="w-2 h-2 rounded-full bg-[#8CFF8C] animate-ping" /> Running
          </span>
          <span className="flex items-center gap-1.5 text-[#666C68]">
            <span className="w-2 h-2 rounded-full bg-[#292D2A]" /> Queued
          </span>
        </div>
      </div>

      {/* 7-Stage Pipeline Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 relative">
        {PIPELINE_STAGES.map((stage, idx) => {
          const status: StageStatus = stageStatuses[stage.id] || "pending";
          const isPending = status === "pending";
          const isRunning = status === "running";
          const isCompleted = status === "completed";
          const isFailed = status === "failed";
          const isCancelled = status === "cancelled";

          return (
            <div key={stage.id} className="relative flex flex-col justify-between">
              <motion.div
                initial={false}
                animate={{
                  scale: isRunning ? [1, 1.02, 1] : 1,
                }}
                transition={{
                  duration: 2.2,
                  repeat: isRunning ? Infinity : 0,
                  ease: "easeInOut",
                }}
                className={clsx(
                  "p-3.5 rounded-xl border flex flex-col justify-between h-full transition-all duration-300 relative select-none",
                  isRunning &&
                    "bg-[#16351F]/40 border-[#8CFF8C] shadow-[0_0_16px_rgba(140,255,140,0.2)] ring-1 ring-[#8CFF8C]/30",
                  isCompleted &&
                    "bg-[#151716] border-[#292D2A] text-[#F4F5F4]",
                  isFailed &&
                    "bg-[#FF5555]/10 border-[#FF5555]/30 text-[#FF5555]",
                  isCancelled &&
                    "bg-[#101211] border-[#292D2A] text-[#666C68]",
                  isPending &&
                    "bg-[#101211] border-[#292D2A]/60 text-[#666C68]"
                )}
              >
                {/* Active Green Pulse Pip for Running Stage */}
                {isRunning && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#8CFF8C] animate-ping" />
                )}

                {/* Top Row: Stage Index & Status Icon */}
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={clsx(
                      "text-[10px] font-mono font-bold uppercase tracking-wider",
                      isRunning
                        ? "text-[#8CFF8C]"
                        : isCompleted
                        ? "text-[#F4F5F4]"
                        : "text-[#666C68]"
                    )}
                  >
                    0{idx + 1}
                  </span>

                  <div className="shrink-0">
                    {isCompleted && (
                      <CheckCircle2 className="w-4 h-4 text-[#8CFF8C]" />
                    )}
                    {isRunning && (
                      <Loader2 className="w-4 h-4 text-[#8CFF8C] animate-spin" />
                    )}
                    {isFailed && <XCircle className="w-4 h-4 text-[#FF5555]" />}
                    {isCancelled && (
                      <AlertTriangle className="w-4 h-4 text-[#666C68]" />
                    )}
                    {isPending && (
                      <div className="text-[#666C68]">{STAGE_ICONS[stage.id]}</div>
                    )}
                  </div>
                </div>

                {/* Stage Title & Short Label */}
                <div className="space-y-0.5">
                  <div
                    className={clsx(
                      "font-sans font-bold text-xs uppercase tracking-wider truncate",
                      isRunning
                        ? "text-[#8CFF8C]"
                        : isCompleted
                        ? "text-[#F4F5F4]"
                        : isFailed
                        ? "text-[#FF5555]"
                        : "text-[#666C68]"
                    )}
                  >
                    {stage.shortLabel}
                  </div>

                  <p
                    className={clsx(
                      "text-[10px] font-mono leading-tight line-clamp-1",
                      isRunning
                        ? "text-[#8CFF8C] font-semibold"
                        : isCompleted
                        ? "text-[#52D96B]"
                        : "text-[#666C68]"
                    )}
                  >
                    {isRunning
                      ? "Executing..."
                      : isCompleted
                      ? "Done"
                      : isFailed
                      ? "Failed"
                      : isCancelled
                      ? "Cancelled"
                      : "Pending"}
                  </p>
                </div>
              </motion.div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
