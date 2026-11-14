import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Activity, RefreshCw } from "lucide-react";
import { NewScanCard } from "@/components/dashboard/NewScanCard";
import { StatsOverview, AggregateStats } from "@/components/dashboard/StatsOverview";
import { RecentScansList } from "@/components/dashboard/RecentScansList";
import { WorkspaceEmptyState } from "@/components/dashboard/WorkspaceEmptyState";
import { Button } from "@/components/ui/Button";
import { api } from "@/api/client";
import { ScanHistoryItem } from "@/types";
import { staggerContainer, cardEntrance } from "@/animations/variants";

interface DashboardPageProps {
  onStartScan: (repoUrl: string, branch?: string, scanners?: string[]) => Promise<string | void>;
  onSelectScan?: (scanId: string) => void;
  isScanning?: boolean;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onStartScan,
  onSelectScan,
  isScanning = false,
}) => {
  const [scans, setScans] = useState<ScanHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newScanCardRef = useRef<HTMLDivElement>(null);

  const [stats, setStats] = useState<AggregateStats>({
    totalScans: 0,
    vulnerabilities: 0,
    criticalFindings: 0,
    fixesGenerated: 0,
    prsCreated: 0,
    hasCriticalMetrics: false,
  });

  const fetchScansAndStats = useCallback(async () => {
    try {
      setError(null);
      const res = await api.listScans();
      const loadedScans = res.scans || [];
      setScans(loadedScans);

      // Compute aggregates strictly from backend responses
      let vulns = 0;
      let fixes = 0;
      let prs = 0;
      let critical = 0;
      let hasCrit = false;

      for (const s of loadedScans) {
        const counts = s.counts || {};
        const prCount = counts.verified_pr_opened || 0;
        const skippedPr = counts.verified_pr_skipped || 0;
        const falsePos = counts.false_positive || 0;

        prs += prCount;
        fixes += prCount + skippedPr;

        // Total confirmed findings across scans (excluding false positives)
        const totalFindings = Object.values(counts).reduce(
          (acc, val) => acc + (typeof val === "number" ? val : 0),
          0
        );
        vulns += Math.max(0, totalFindings - falsePos);
      }

      // If there are scans, fetch status of the latest completed scan to check for critical metrics
      const completedScan = loadedScans.find((s) => s.status === "complete");
      if (completedScan) {
        try {
          const detail = await api.getScanStatus(completedScan.scan_id);
          if (detail.summary_metrics) {
            critical = detail.summary_metrics.critical || 0;
            hasCrit = true;
          }
        } catch {
          // If status detail cannot be fetched, keep critical at 0
        }
      }

      setStats({
        totalScans: loadedScans.length,
        vulnerabilities: vulns,
        criticalFindings: critical,
        fixesGenerated: fixes,
        prsCreated: prs,
        hasCriticalMetrics: hasCrit,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load scan history";
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchScansAndStats();
  }, [fetchScansAndStats]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchScansAndStats();
  };

  const handleFocusNewScan = () => {
    newScanCardRef.current?.scrollIntoView({ behavior: "smooth" });
    const input = newScanCardRef.current?.querySelector("input");
    input?.focus();
  };

  // Determine greeting based on local time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 17) return "Good evening, CodeSage";
    if (hour >= 12) return "Good afternoon, CodeSage";
    return "Good morning, CodeSage";
  };

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6 sm:space-y-8 max-w-7xl mx-auto"
    >
      {/* 1. Header Greeting Area */}
      <motion.div
        variants={cardEntrance}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1"
      >
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-accent-orange/10 border border-accent-orange/25 text-accent-orange text-xs font-mono font-medium mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-orange animate-pulse" />
            Security Command Center
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-sans font-bold text-white tracking-tight">
            {getGreeting()}
          </h1>
          <p className="text-xs sm:text-sm text-sage-400 font-sans max-w-2xl">
            Autonomous security engineering for your codebase.
          </p>
        </div>

        {/* Live Engine Status & Refresh */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-sage-900 border border-white/[0.08] text-xs font-mono text-sage-300">
            <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="hidden sm:inline">Engine:</span>
            <span className="text-emerald-400 font-semibold">Active</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            loading={refreshing}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />}
            className="text-xs font-mono"
          >
            Refresh
          </Button>
        </div>
      </motion.div>

      {/* 2. Top Stats Overview (Animated Counters) */}
      <motion.div variants={cardEntrance}>
        <StatsOverview stats={stats} loading={loading} />
      </motion.div>

      {/* 3. New Scan Card + Security Guarantees */}
      <motion.div ref={newScanCardRef} variants={cardEntrance}>
        <NewScanCard onStartScan={onStartScan} isScanning={isScanning} />
      </motion.div>

      {/* 4. Recent Scans or Empty Workspace State */}
      <motion.div variants={cardEntrance}>
        {error ? (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs font-mono flex items-center justify-between">
            <span>{error}</span>
            <Button variant="ghost" size="xs" onClick={handleManualRefresh}>
              Retry
            </Button>
          </div>
        ) : loading ? (
          <div className="p-12 text-center text-sage-500 font-mono text-xs">
            Loading security workspace history...
          </div>
        ) : scans.length === 0 ? (
          <div className="glass-panel rounded-2xl p-6 sm:p-8">
            <WorkspaceEmptyState onFocusInput={handleFocusNewScan} />
          </div>
        ) : (
          <RecentScansList scans={scans} onSelectScan={onSelectScan} />
        )}
      </motion.div>
    </motion.div>
  );
};
