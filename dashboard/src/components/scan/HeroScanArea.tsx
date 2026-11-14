import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Github,
  GitBranch,
  Copy,
  Check,
  Clock,
  SquareSlash,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  StopCircle,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
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
}

export const HeroScanArea: React.FC<HeroScanAreaProps> = ({
  repoUrl,
  branch,
  scanId,
  status,
  currentStageId,
  progressPercent,
  startedAt,
  finishedAt,
  onCancelRequest,
  isCancelling = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Live elapsed timer calculation
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

  const formatTimer = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    const tenths = Math.floor((totalSeconds % 1) * 10);
    if (mins === 0) {
      return `${secs}.${tenths}s`;
    }
    return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  };

  // Extract clean repository display name
  const getDisplayName = (url: string) => {
    if (!url) return "Target Repository";
    if (url.includes("github.com/")) {
      const parts = url.split("github.com/")[1]?.split(".git")[0]?.split("/");
      if (parts && parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    }
    const segments = url.split("/").filter(Boolean);
    return segments[segments.length - 1] || url;
  };

  // SVG Circular progress geometry
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - (Math.min(100, Math.max(0, progressPercent)) / 100) * circumference;

  const isRunning = status === "running" || status === "queued";
  const isComplete = status === "complete";
  const isCancelled = status === "cancelled";
  const isFailed = status === "failed";

  return (
    <Card
      variant="elevated"
      className="p-6 sm:p-8 relative overflow-hidden transition-all duration-300 border-white/[0.08]"
    >
      {/* Background Radial Glow */}
      <div
        className={clsx(
          "absolute -top-24 -right-24 w-96 h-96 rounded-full blur-3xl pointer-events-none transition-opacity duration-700",
          isRunning && "bg-accent-orange/10 opacity-100",
          isComplete && "bg-emerald-500/10 opacity-100",
          isCancelled && "bg-amber-500/10 opacity-80",
          isFailed && "bg-rose-500/10 opacity-80"
        )}
      />

      <div className="flex flex-col lg:flex-row items-center justify-between gap-6 relative z-10">
        {/* Left Information Area */}
        <div className="space-y-4 max-w-2xl text-center lg:text-left w-full lg:w-auto">
          {/* Header Status Tag */}
          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2.5">
            <span className="text-xs font-mono font-medium uppercase tracking-wider text-accent-orange flex items-center gap-1.5">
              {isRunning && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-orange opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-orange" />
                </span>
              )}
              {isComplete && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
              {isCancelled && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
              {isFailed && <XCircle className="w-3.5 h-3.5 text-rose-400" />}

              <span>
                {isRunning
                  ? "Scanning Repository"
                  : isComplete
                  ? "Audit Run Complete"
                  : isCancelled
                  ? "Scan Cancelled"
                  : "Scan Failed"}
              </span>
            </span>

            <span className="text-white/[0.2] hidden sm:inline">•</span>

            {/* Live Status Pill */}
            <Badge
              variant={
                isRunning
                  ? "medium"
                  : isComplete
                  ? "success"
                  : isCancelled
                  ? "warning"
                  : "critical"
              }
              size="xs"
              dot={isRunning}
            >
              {status}
            </Badge>
          </div>

          {/* Repository Main Title */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-sans font-bold text-white tracking-tight flex items-center justify-center lg:justify-start gap-2.5">
              <Github className="w-6 h-6 text-sage-300 shrink-0" />
              <span className="truncate">{getDisplayName(repoUrl)}</span>
            </h1>

            <p className="text-xs font-mono text-sage-400 mt-1 truncate max-w-xl">
              {repoUrl}
            </p>
          </div>

          {/* Metadata Badges: Branch, Scan ID, Elapsed Timer */}
          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2.5 pt-1">
            {/* Branch */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sage-900 border border-white/[0.08] text-xs font-mono text-sage-300">
              <GitBranch className="w-3.5 h-3.5 text-accent-violet" />
              <span>{branch || "default branch"}</span>
            </div>

            {/* Scan ID with Copy Action */}
            <button
              type="button"
              onClick={handleCopyId}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sage-900 border border-white/[0.08] text-xs font-mono text-sage-300 hover:text-white hover:border-white/[0.15] transition-colors group select-none"
              title="Click to copy scan ID"
            >
              <SquareSlash className="w-3.5 h-3.5 text-accent-teal" />
              <span>{scanId}</span>
              {copied ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3 text-sage-500 group-hover:text-sage-300 transition-colors" />
              )}
            </button>

            {/* Elapsed Time */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sage-900 border border-white/[0.08] text-xs font-mono text-sage-300">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Elapsed: {formatTimer(elapsedSeconds)}</span>
            </div>
          </div>
        </div>

        {/* Right Area: Large Animated Progress Indicator + Cancel Trigger */}
        <div className="flex flex-col sm:flex-row items-center gap-6 shrink-0">
          {/* Animated Circular Progress Gauge */}
          <div className="relative w-36 h-36 flex items-center justify-center">
            {/* Outer Subtle Ambient Pulse when running */}
            {isRunning && (
              <motion.div
                animate={{
                  scale: [1, 1.08, 1],
                  opacity: [0.2, 0.45, 0.2],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="absolute inset-0 rounded-full bg-accent-orange/15 blur-md"
              />
            )}

            <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 160 160">
              {/* Background Track Circle */}
              <circle
                cx="80"
                cy="80"
                r={radius}
                className="stroke-sage-900 fill-transparent"
                strokeWidth="8"
              />

              {/* Animated Progress Circle */}
              <motion.circle
                cx="80"
                cy="80"
                r={radius}
                className={clsx(
                  "fill-transparent transition-colors duration-500",
                  isRunning && "stroke-accent-orange",
                  isComplete && "stroke-emerald-400",
                  isCancelled && "stroke-amber-400",
                  isFailed && "stroke-rose-400"
                )}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                animate={{ strokeDashoffset: strokeOffset }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                style={{
                  filter: isRunning
                    ? "drop-shadow(0 0 6px rgba(249, 115, 22, 0.6))"
                    : isComplete
                    ? "drop-shadow(0 0 6px rgba(16, 185, 129, 0.6))"
                    : undefined,
                }}
              />
            </svg>

            {/* Inner Center Statistics */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-sans font-bold text-white tracking-tight font-feature-numeric">
                {Math.round(progressPercent)}%
              </span>
              <span className="text-[10px] font-mono text-sage-400 uppercase tracking-wider mt-0.5 max-w-[80px] truncate">
                {currentStageId ? currentStageId : isComplete ? "Done" : status}
              </span>
            </div>
          </div>

          {/* Cancel Scan Button */}
          {isRunning && onCancelRequest && (
            <div className="flex flex-col items-center gap-1.5">
              <Button
                variant="danger"
                size="sm"
                onClick={onCancelRequest}
                loading={isCancelling}
                icon={<StopCircle className="w-4 h-4" />}
                className="font-mono text-xs shadow-[0_0_12px_rgba(244,63,94,0.15)]"
              >
                Cancel Scan
              </Button>
              <span className="text-[10px] font-mono text-sage-500">
                Safe cooperative stop
              </span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
