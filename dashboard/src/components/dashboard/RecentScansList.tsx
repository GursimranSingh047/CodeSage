import React from "react";
import { motion } from "framer-motion";
import {
  Github,
  GitBranch,
  Clock,
  Timer,
  ArrowUpRight,
  Layers,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ScanHistoryItem, ScanStatus } from "@/types";
import { cardEntrance } from "@/animations/variants";
import { clsx } from "clsx";

interface RecentScansListProps {
  scans: ScanHistoryItem[];
  onSelectScan?: (scanId: string) => void;
  className?: string;
}

function formatDuration(started: number, finished?: number | null): string {
  if (!finished) return "In Progress";
  const seconds = Math.max(0, finished - started);
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSecs = Math.floor(seconds % 60);
  return `${minutes}m ${remainingSecs}s`;
}

function formatTimestamp(timestamp: number): string {
  if (!timestamp) return "Unknown";
  // Milliseconds vs seconds detection
  const ms = timestamp > 10000000000 ? timestamp : timestamp * 1000;
  const date = new Date(ms);
  const now = Date.now();
  const diffSecs = Math.floor((now - date.getTime()) / 1000);

  if (diffSecs < 60) return "Just now";
  if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
  if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
  if (diffSecs < 604800) return `${Math.floor(diffSecs / 86400)}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getRepoDisplayName(repoUrl: string): { name: string; isGitHub: boolean } {
  if (!repoUrl) return { name: "Unknown Repository", isGitHub: false };
  if (repoUrl.includes("github.com/")) {
    const parts = repoUrl.split("github.com/")[1]?.split(".git")[0]?.split("/");
    if (parts && parts.length >= 2) {
      return { name: `${parts[0]}/${parts[1]}`, isGitHub: true };
    }
  }
  const segments = repoUrl.split("/").filter(Boolean);
  return {
    name: segments[segments.length - 1] || repoUrl,
    isGitHub: repoUrl.startsWith("http") || repoUrl.includes("git"),
  };
}

export const RecentScansList: React.FC<RecentScansListProps> = ({
  scans,
  onSelectScan,
  className,
}) => {
  const getStatusBadge = (status: ScanStatus) => {
    switch (status) {
      case "running":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-accent-orange/15 text-orange-400 border border-accent-orange/30">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-orange animate-ping" />
            Running
          </span>
        );
      case "complete":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Complete
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-rose-500/10 text-rose-400 border border-rose-500/25">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            Failed
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/25">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Cancelled
          </span>
        );
      case "queued":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-teal-500/10 text-teal-400 border border-teal-500/25">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
            Queued
          </span>
        );
      default:
        return (
          <Badge variant="default" size="xs">
            {status}
          </Badge>
        );
    }
  };

  return (
    <div className={clsx("space-y-3", className)}>
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-sans font-semibold text-white tracking-tight flex items-center gap-2">
          <Clock className="w-4 h-4 text-accent-orange" />
          <span>Recent Scans</span>
        </h3>
        <span className="text-xs font-mono text-sage-400">
          {scans.length} total run{scans.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-2.5">
        {scans.map((scan) => {
          const { name, isGitHub } = getRepoDisplayName(scan.repo_url);
          const totalFindings = Object.values(scan.counts || {}).reduce(
            (acc, val) => acc + (typeof val === "number" ? val : 0),
            0
          );
          const prCount = scan.counts?.verified_pr_opened || 0;

          return (
            <motion.div
              key={scan.scan_id}
              variants={cardEntrance}
              whileHover={{ y: -2 }}
              transition={{ duration: 0.2 }}
            >
              <Card
                variant="subtle"
                onClick={() => onSelectScan?.(scan.scan_id)}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:border-accent-orange/30 hover:shadow-[0_4px_20px_rgba(0,0,0,0.4)] transition-all group"
              >
                {/* Left Area: Repo & Branch */}
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-sage-900 border border-white/[0.08] flex items-center justify-center text-sage-300 group-hover:text-accent-orange group-hover:border-accent-orange/30 transition-colors shrink-0">
                    {isGitHub ? <Github className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
                  </div>

                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-sans font-semibold text-sm text-white truncate group-hover:text-accent-orange transition-colors">
                        {name}
                      </span>
                      <span className="text-xs font-mono text-sage-500 hidden md:inline">
                        #{scan.scan_id.slice(0, 8)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {scan.branch && (
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-sage-300 bg-sage-900 px-2 py-0.5 rounded border border-white/[0.06]">
                          <GitBranch className="w-3 h-3 text-accent-violet" />
                          {scan.branch}
                        </span>
                      )}

                      <span className="text-sage-500 font-mono text-[11px] flex items-center gap-1">
                        <Timer className="w-3 h-3 text-sage-400" />
                        {formatDuration(scan.started, scan.finished)}
                      </span>

                      <span className="text-sage-500 font-mono text-[11px]">
                        • {formatTimestamp(scan.started)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Area: Findings, Status, Action */}
                <div className="flex items-center justify-between sm:justify-end gap-3.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.04]">
                  {/* Findings breakdown badge */}
                  <div className="text-right">
                    <div className="text-xs font-mono font-semibold text-white">
                      {totalFindings > 0 ? (
                        <span>{totalFindings} Finding{totalFindings === 1 ? "" : "s"}</span>
                      ) : (
                        <span className="text-sage-400">Clean</span>
                      )}
                    </div>
                    {prCount > 0 && (
                      <div className="text-[10px] font-mono text-accent-violet">
                        {prCount} PR{prCount === 1 ? "" : "s"} opened
                      </div>
                    )}
                  </div>

                  {/* Status Badge */}
                  <div>{getStatusBadge(scan.status)}</div>

                  <ArrowUpRight className="w-4 h-4 text-sage-500 group-hover:text-accent-orange group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all hidden sm:block" />
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
