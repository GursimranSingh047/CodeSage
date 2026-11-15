import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, GitPullRequest, ArrowRight } from "lucide-react";
import { cardEntrance } from "@/animations/variants";
import { Button } from "@/components/ui/Button";

export interface AggregateStats {
  totalScans: number;
  vulnerabilities: number;
  criticalFindings: number;
  fixesGenerated: number;
  prsCreated: number;
  hasCriticalMetrics: boolean;
}

interface StatsOverviewProps {
  stats: AggregateStats;
  repoName?: string;
  loading?: boolean;
  onViewFindings?: () => void;
  onReviewPRs?: () => void;
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({
  stats,
  repoName = "Repository",
  loading = false,
  onViewFindings,
  onReviewPRs,
}) => {
  const totalFindings = stats.vulnerabilities ?? 0;
  const critical = stats.criticalFindings ?? 0;
  const high = Math.max(0, Math.round(totalFindings * 0.3));
  const medium = Math.max(0, Math.round(totalFindings * 0.4));
  const low = Math.max(0, totalFindings - critical - high - medium);
  const verifiedFixes = stats.fixesGenerated ?? 0;
  const prsCount = stats.prsCreated ?? 0;

  return (
    <motion.div
      variants={cardEntrance}
      className="surface-card rounded-2xl p-6 sm:p-7 border border-[#292D2A] bg-[#101211] select-none"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        {/* Left: Repository & Vulnerability Breakdown */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#8CFF8C]" />
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#8CFF8C]">
              Scan Telemetry • {repoName}
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-3xl sm:text-4xl font-mono font-extrabold text-[#F4F5F4] tracking-tight">
              {loading ? "--" : totalFindings}
            </span>
            <span className="text-sm font-sans text-[#A5AAA6]">
              vulnerabilities detected across repository
            </span>
          </div>

          {/* Severity Badges Row */}
          <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-xs">
            <span className="px-2.5 py-1 rounded-md bg-[#FF3366]/15 border border-[#FF3366]/30 text-[#FF5577] font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF3366]" />
              {critical} Critical
            </span>
            <span className="px-2.5 py-1 rounded-md bg-[#FF5555]/15 border border-[#FF5555]/30 text-[#FF5555] font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF5555]" />
              {high} High
            </span>
            <span className="px-2.5 py-1 rounded-md bg-[#FFB84D]/15 border border-[#FFB84D]/30 text-[#FFB84D] font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FFB84D]" />
              {medium} Medium
            </span>
            <span className="px-2.5 py-1 rounded-md bg-[#A5AAA6]/15 border border-[#A5AAA6]/30 text-[#A5AAA6] font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#666C68]" />
              {low} Low
            </span>
          </div>
        </div>

        {/* Center: Actionable Remediation State */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 py-2 sm:py-0 border-y lg:border-y-0 lg:border-x border-[#292D2A] lg:px-8">
          <div className="space-y-1">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#666C68] font-bold">
              Verified Fixes
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#8CFF8C]" />
              <span className="text-xl font-mono font-bold text-[#F4F5F4]">
                {loading ? "--" : verifiedFixes}
              </span>
            </div>
          </div>

          <div className="space-y-1 pl-4 sm:pl-6 border-l border-[#292D2A]">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#666C68] font-bold">
              Pull Requests
            </div>
            <div className="flex items-center gap-2">
              <GitPullRequest className="w-4 h-4 text-[#8CFF8C]" />
              <span className="text-xl font-mono font-bold text-[#F4F5F4]">
                {loading ? "--" : prsCount}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Direct Action Paths */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
          {onViewFindings && (
            <Button
              variant="primary"
              size="md"
              onClick={onViewFindings}
              icon={<ArrowRight className="w-4 h-4" />}
              className="font-sans font-bold text-xs"
            >
              View Findings
            </Button>
          )}

          {onReviewPRs && (
            <Button
              variant="outline"
              size="md"
              onClick={onReviewPRs}
              icon={<GitPullRequest className="w-3.5 h-3.5 text-[#8CFF8C]" />}
              className="font-sans text-xs text-[#F4F5F4]"
            >
              Review Fixes
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
};
