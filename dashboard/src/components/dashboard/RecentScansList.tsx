import React from "react";
import { motion } from "framer-motion";
import {
  GitBranch,
  Clock,
  ArrowUpRight,
  Terminal,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ScanHistoryItem } from "@/types";
import { cardEntrance } from "@/animations/variants";
import { clsx } from "clsx";

interface RecentScansListProps {
  scans: ScanHistoryItem[];
  onSelectScan?: (scanId: string) => void;
  className?: string;
}

function formatDuration(started: number, finished?: number | null): string {
  if (!finished) return "Active";
  const seconds = Math.max(0, finished - started);
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSecs = Math.floor(seconds % 60);
  return `${minutes}m ${remainingSecs}s`;
}

function formatTimestamp(timestamp: number): string {
  if (!timestamp) return "—";
  const ms = timestamp > 10000000000 ? timestamp : timestamp * 1000;
  const date = new Date(ms);
  const now = Date.now();
  const diffSecs = Math.floor((now - date.getTime()) / 1000);

  if (diffSecs < 60) return "Just now";
  if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
  if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function getRepoDisplayName(repoUrl: string): string {
  if (!repoUrl) return "Target Repository";
  if (repoUrl.includes("github.com/")) {
    const parts = repoUrl.split("github.com/")[1]?.split(".git")[0]?.split("/");
    if (parts && parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
  }
  const parts = repoUrl.split("/").filter(Boolean);
  return parts[parts.length - 1] || repoUrl;
}

export const RecentScansList: React.FC<RecentScansListProps> = ({
  scans,
  onSelectScan,
  className,
}) => {
  return (
    <div className={clsx("space-y-3", className)}>
      <div className="space-y-2">
        {scans.slice(0, 5).map((scan) => {
          const findingsCount = Object.values(scan.counts || {}).reduce(
            (acc, val) => acc + (typeof val === "number" ? val : 0),
            0
          );
          const duration = formatDuration(scan.started, scan.finished);
          const timeAgo = formatTimestamp(scan.started);
          const repoName = getRepoDisplayName(scan.repo_url);

          return (
            <motion.div
              key={scan.scan_id}
              variants={cardEntrance}
              onClick={() => onSelectScan?.(scan.scan_id)}
              className="surface-card rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-[#363C38] transition-all cursor-pointer group select-none"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#151716] border border-[#292D2A] flex items-center justify-center text-[#A5AAA6] group-hover:text-[#8CFF8C] group-hover:border-[#8CFF8C]/40 transition-colors shrink-0">
                  <Terminal className="w-4 h-4" />
                </div>

                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#F4F5F4] truncate group-hover:text-[#8CFF8C] transition-colors">
                      {repoName}
                    </span>
                    <Badge
                      variant={
                        scan.status === "complete"
                          ? "green"
                          : scan.status === "running"
                          ? "green"
                          : "neutral"
                      }
                      size="xs"
                      dot={scan.status === "running"}
                    >
                      {scan.status}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] font-mono text-[#666C68]">
                    <span className="flex items-center gap-1">
                      <GitBranch className="w-3 h-3 text-[#666C68]" />
                      <span>{scan.branch || "main"}</span>
                    </span>
                    <span>&bull;</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#666C68]" />
                      <span>{timeAgo}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 text-xs font-mono pt-2 sm:pt-0 border-t sm:border-t-0 border-[#292D2A]">
                <div className="text-right">
                  <span className="text-[#F4F5F4] font-semibold">
                    {findingsCount} finding{findingsCount === 1 ? "" : "s"}
                  </span>
                  <span className="text-[10px] text-[#666C68] block">
                    Duration: {duration}
                  </span>
                </div>

                <div className="w-7 h-7 rounded-lg bg-[#151716] border border-[#292D2A] flex items-center justify-center text-[#666C68] group-hover:text-[#8CFF8C] group-hover:border-[#8CFF8C]/40 transition-colors">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
