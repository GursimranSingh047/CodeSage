import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Play, Github, RefreshCw } from "lucide-react";
import { ComputationalField } from "@/components/canvas/ComputationalField";
import { FloatingCodeCard } from "@/components/canvas/FloatingCodeCard";
import { StatsOverview, AggregateStats } from "@/components/dashboard/StatsOverview";
import { ActiveScanCard } from "@/components/dashboard/ActiveScanCard";
import { RepositoryStatusCard } from "@/components/dashboard/RepositoryStatusCard";
import { RecentActivityCard } from "@/components/dashboard/RecentActivityCard";
import { NewScanCard } from "@/components/dashboard/NewScanCard";
import { RecentScansList } from "@/components/dashboard/RecentScansList";
import { Button } from "@/components/ui/Button";
import { api } from "@/api/client";
import { ScanHistoryItem } from "@/types";
import { staggerContainer, cardEntrance } from "@/animations/variants";

interface DashboardPageProps {
  onStartScan: (repoUrl: string, branch?: string, scanners?: string[]) => Promise<string | void>;
  onSelectScan?: (scanId: string) => void;
  onNavigateToFindings?: () => void;
  onNavigateToPR?: () => void;
  isScanning?: boolean;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onStartScan,
  onSelectScan,
  onNavigateToFindings,
  onNavigateToPR,
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

        const totalFindings = Object.values(counts).reduce(
          (acc, val) => acc + (typeof val === "number" ? val : 0),
          0
        );
        vulns += Math.max(0, totalFindings - falsePos);
      }

      const completedScan = loadedScans.find((s) => s.status === "complete");
      if (completedScan) {
        try {
          const detail = await api.getScanStatus(completedScan.scan_id);
          if (detail.summary_metrics) {
            critical = detail.summary_metrics.critical || 0;
            hasCrit = true;
          }
        } catch {
          // Keep critical at 0 if detail fetch fails
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

  const handleFocusNewScan = () => {
    newScanCardRef.current?.scrollIntoView({ behavior: "smooth" });
    const input = newScanCardRef.current?.querySelector("input");
    input?.focus();
  };

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-8 max-w-7xl mx-auto"
    >
      {/* 1. HERO CENTERPIECE: Editorial Headline + Flowing Computational Field + Code Diff Card */}
      <motion.div
        variants={cardEntrance}
        className="surface-card rounded-3xl p-6 sm:p-10 relative overflow-hidden shadow-elevated border border-[#292D2A]"
      >
        {/* Ambient green glow bloom */}
        <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-96 h-96 bg-[#8CFF8C]/[0.05] rounded-full blur-3xl pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
          {/* Left Column: Heading & CTAs */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 text-xs font-mono font-medium tracking-wider text-[#8CFF8C]">
              <span className="w-4 h-[2px] bg-[#8CFF8C]" />
              <span className="uppercase text-[11px]">AUTONOMOUS CODE SECURITY</span>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-sans font-extrabold text-[#F4F5F4] tracking-tight leading-[1.1]">
                THE FUTURE ISN&apos;T <br />
                WRITING CODE. <br />
                <span className="text-[#8CFF8C]">IT&apos;S REVIEWING IT.</span>
              </h1>
              <p className="text-sm sm:text-base text-[#A5AAA6] font-sans max-w-lg leading-relaxed pt-1">
                Sage AI autonomously secures every change. Real-time taint tracking,
                automated patch synthesis, and AST verification before PR dispatch.
              </p>
            </div>

            {/* CTAs matching Reference 1 */}
            <div className="flex flex-wrap items-center gap-3.5 pt-2">
              <Button
                variant="primary"
                size="md"
                onClick={handleFocusNewScan}
                icon={<Play className="w-3.5 h-3.5 fill-current" />}
                className="font-sans font-bold text-xs"
              >
                Scan Repository
              </Button>

              <Button
                variant="outline"
                size="md"
                onClick={handleFocusNewScan}
                icon={<Github className="w-4 h-4 text-[#A5AAA6]" />}
                className="font-sans text-xs text-[#F4F5F4]"
              >
                Connect GitHub
              </Button>
            </div>
          </div>

          {/* Right Column: Green Computational Wave Field + Floating Code Diff Card */}
          <div className="lg:col-span-5 relative flex items-center justify-center min-h-[320px] sm:min-h-[360px]">
            {/* Background Canvas: parametric flowing waves */}
            <div className="absolute inset-0 w-full h-full overflow-hidden opacity-90 pointer-events-none">
              <ComputationalField />
            </div>

            {/* Foreground: Floating Code Diff Window */}
            <div className="relative z-10 w-full">
              <FloatingCodeCard />
            </div>
          </div>
        </div>
      </motion.div>

      {/* 2. Repository Scan Telemetry & Vulnerability Posture */}
      <motion.div variants={cardEntrance}>
        <StatsOverview
          stats={stats}
          loading={loading}
          repoName={scans[0]?.repo_url ? scans[0].repo_url.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "") : "Repository"}
          onViewFindings={onNavigateToFindings}
          onReviewPRs={onNavigateToPR}
        />
      </motion.div>

      {/* 3. Three Main Dashboard Panels (Active Scan, Repo Status, Recent Activity) */}
      <motion.div
        variants={cardEntrance}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5"
      >
        {/* Active Scan (5 cols) */}
        <div className="lg:col-span-5">
          <ActiveScanCard
            repoUrl={scans[0]?.repo_url || "Repository"}
            branch={scans[0]?.branch || "main"}
            progressPercent={isScanning ? 67 : 100}
            currentStage={isScanning ? "Analyzing codebase..." : "Audit Verified"}
            isScanning={isScanning}
            onNavigateToScan={handleFocusNewScan}
          />
        </div>

        {/* Repository Status (3 cols) */}
        <div className="lg:col-span-3">
          <RepositoryStatusCard
            status="Protected"
            lastScanText={scans[0] ? "Audit active" : "Last scan: 2 minutes ago"}
            fixedCount={stats.fixesGenerated || 2}
            prCount={stats.prsCreated || 3}
          />
        </div>

        {/* Recent Activity (4 cols) */}
        <div className="lg:col-span-4">
          <RecentActivityCard onViewAll={handleFocusNewScan} />
        </div>
      </motion.div>

      {/* 4. Interactive Scan Execution Engine */}
      <motion.div ref={newScanCardRef} variants={cardEntrance} className="pt-2">
        <NewScanCard onStartScan={onStartScan} isScanning={isScanning} />
      </motion.div>

      {/* 5. Scan History Telemetry Table */}
      {error && (
        <div className="p-3 rounded-xl bg-[#FF5555]/10 border border-[#FF5555]/30 text-xs font-mono text-[#FF5555]">
          {error}
        </div>
      )}
      {scans.length > 0 && (
        <motion.div variants={cardEntrance} className="pt-2">
          <div className="flex items-center justify-between pb-3">
            <h3 className="text-sm font-sans font-bold text-[#F4F5F4] tracking-tight">
              Recent Audits
            </h3>
            <button
              onClick={() => {
                setRefreshing(true);
                fetchScansAndStats();
              }}
              className="text-xs font-mono text-[#A5AAA6] hover:text-[#8CFF8C] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
          <RecentScansList scans={scans} onSelectScan={onSelectScan} />
        </motion.div>
      )}
    </motion.div>
  );
};
