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
import { Card } from "@/components/ui/Card";
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
    <Card variant="elevated" className={clsx("p-5 sm:p-6", className)}>
      <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-6">
        <div>
          <h3 className="text-sm font-sans font-semibold text-white tracking-tight flex items-center gap-2">
            <span>Autonomous Pipeline Orchestration</span>
          </h3>
          <p className="text-xs text-sage-400 font-sans mt-0.5">
            Real-time execution across 7 specialized engineering stages.
          </p>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-mono text-sage-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> Completed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent-orange animate-ping" /> Running
          </span>
        </div>
      </div>

      {/* Horizontal / Wrapped Grid of Stages */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-2.5 relative">
        {PIPELINE_STAGES.map((stage, idx) => {
          const status: StageStatus = stageStatuses[stage.id] || "pending";
          const isPending = status === "pending";
          const isRunning = status === "running";
          const isCompleted = status === "completed";
          const isFailed = status === "failed";
          const isCancelled = status === "cancelled";

          return (
            <div key={stage.id} className="relative flex flex-col justify-between">
              {/* Main Stage Node Card */}
              <motion.div
                initial={false}
                animate={{
                  scale: isRunning ? [1, 1.02, 1] : 1,
                }}
                transition={{
                  duration: 2.5,
                  repeat: isRunning ? Infinity : 0,
                  ease: "easeInOut",
                }}
                className={clsx(
                  "p-3.5 rounded-xl border flex flex-col justify-between h-full transition-all duration-300 relative select-none",
                  isRunning &&
                    "bg-accent-orange/10 border-accent-orange/50 shadow-[0_0_16px_rgba(249,115,22,0.25)] ring-1 ring-accent-orange/40",
                  isCompleted &&
                    "bg-emerald-500/10 border-emerald-500/30 text-white shadow-[0_0_12px_rgba(16,185,129,0.1)]",
                  isFailed &&
                    "bg-rose-500/10 border-rose-500/40 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.15)]",
                  isCancelled &&
                    "bg-amber-500/10 border-amber-500/30 text-amber-300",
                  isPending &&
                    "bg-sage-900/60 border-white/[0.06] text-sage-500"
                )}
              >
                {/* Active Glowing Ring Particle for Running Stage */}
                {isRunning && (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                    className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-t-2 border-r-2 border-accent-orange"
                  />
                )}

                {/* Top Row: Stage Index & Status Icon */}
                <div className="flex items-center justify-between mb-2.5">
                  <span
                    className={clsx(
                      "text-[10px] font-mono font-bold uppercase tracking-wider",
                      isRunning
                        ? "text-accent-orange"
                        : isCompleted
                        ? "text-emerald-400"
                        : "text-sage-500"
                    )}
                  >
                    0{idx + 1}
                  </span>

                  {/* Stage Icon according to state */}
                  <div className="shrink-0">
                    {isCompleted && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    )}
                    {isRunning && (
                      <Loader2 className="w-4 h-4 text-accent-orange animate-spin" />
                    )}
                    {isFailed && <XCircle className="w-4 h-4 text-rose-400" />}
                    {isCancelled && (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    )}
                    {isPending && (
                      <div className="text-sage-600">{STAGE_ICONS[stage.id]}</div>
                    )}
                  </div>
                </div>

                {/* Stage Title & Short Label */}
                <div className="space-y-1">
                  <div
                    className={clsx(
                      "font-sans font-bold text-xs uppercase tracking-wider truncate",
                      isRunning
                        ? "text-white"
                        : isCompleted
                        ? "text-white"
                        : isFailed
                        ? "text-rose-300"
                        : isCancelled
                        ? "text-amber-300"
                        : "text-sage-400"
                    )}
                  >
                    {stage.shortLabel}
                  </div>

                  <p
                    className={clsx(
                      "text-[10px] font-mono leading-tight line-clamp-2",
                      isRunning
                        ? "text-accent-orange"
                        : isCompleted
                        ? "text-emerald-400/90"
                        : "text-sage-500"
                    )}
                  >
                    {isRunning
                      ? "Executing..."
                      : isCompleted
                      ? "Completed"
                      : isFailed
                      ? "Execution Failed"
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
    </Card>
  );
};
