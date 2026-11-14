import React from "react";
import { motion } from "framer-motion";
import { ShieldAlert, GitPullRequest, Wrench, Layers, AlertOctagon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { AnimatedCounter } from "@/components/ui/AnimatedCounter";
import { cardEntrance } from "@/animations/variants";

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
  loading?: boolean;
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({ stats, loading = false }) => {
  const statCards = [
    {
      id: "scans",
      label: "Total Scans",
      value: stats.totalScans,
      icon: <Layers className="w-5 h-5 text-accent-orange" />,
      glow: "orange" as const,
      subtext: "Durable audit runs",
    },
    {
      id: "vulns",
      label: "Vulnerabilities",
      value: stats.vulnerabilities,
      icon: <ShieldAlert className="w-5 h-5 text-rose-400" />,
      glow: "none" as const,
      subtext: "Confirmed real CVEs/CWEs",
    },
    {
      id: "critical",
      label: "Critical Findings",
      value: stats.criticalFindings,
      icon: <AlertOctagon className="w-5 h-5 text-rose-500" />,
      glow: "none" as const,
      subtext: stats.hasCriticalMetrics ? "High-severity vulnerabilities" : "From detailed scans",
    },
    {
      id: "fixes",
      label: "Fixes Generated",
      value: stats.fixesGenerated,
      icon: <Wrench className="w-5 h-5 text-accent-teal" />,
      glow: "teal" as const,
      subtext: "Verified in sandbox",
    },
    {
      id: "prs",
      label: "PRs Created",
      value: stats.prsCreated,
      icon: <GitPullRequest className="w-5 h-5 text-accent-violet" />,
      glow: "violet" as const,
      subtext: "Autonomous PR agent",
    },
  ];

  return (
    <motion.div
      variants={cardEntrance}
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4"
    >
      {statCards.map((card) => (
        <Card
          key={card.id}
          glow={card.glow}
          className="p-4 sm:p-5 flex flex-col justify-between relative overflow-hidden transition-all duration-300 group hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-mono uppercase tracking-wider text-sage-400 font-medium">
              {card.label}
            </span>
            <div className="p-1.5 rounded-lg bg-sage-900 border border-white/[0.06] group-hover:border-white/[0.12] transition-colors">
              {card.icon}
            </div>
          </div>

          <div>
            <div className="text-2xl sm:text-3xl font-sans font-bold text-white tracking-tight font-feature-numeric">
              {loading ? (
                <div className="h-8 w-14 bg-sage-800 rounded animate-pulse" />
              ) : (
                <AnimatedCounter value={card.value} />
              )}
            </div>
            <div className="text-[11px] font-mono text-sage-500 mt-1 truncate">
              {card.subtext}
            </div>
          </div>
        </Card>
      ))}
    </motion.div>
  );
};
