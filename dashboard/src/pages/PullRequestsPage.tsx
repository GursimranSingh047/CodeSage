import React, { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitPullRequest,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Search,
  RefreshCw,
  Github,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/api/client";
import { Finding } from "@/types";
import { GitHubPRPanel } from "@/components/remediation/GitHubPRPanel";
import { RemediationWorkflowSequence } from "@/components/remediation/RemediationWorkflowSequence";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { cardEntrance, staggerContainer } from "@/animations/variants";
import { clsx } from "clsx";

interface PullRequestsPageProps {
  initialScanId?: string | null;
  onNavigateToScan?: (scanId: string) => void;
  onNavigateToDashboard?: () => void;
}

export const PullRequestsPage: React.FC<PullRequestsPageProps> = ({
  initialScanId,
  onNavigateToScan,
  onNavigateToDashboard,
}) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "opened" | "skipped" | "failed">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const loadPRData = async () => {
    try {
      setRefreshing(true);
      const prItems: Finding[] = [];

      // If initialScanId is present, prioritize it
      if (initialScanId) {
        try {
          const res = await api.getScanFindings(initialScanId);
          const relevant = (res.completed || []).filter(
            (f: Finding) =>
              f.pr_url ||
              f.status === "verified_pr_opened" ||
              f.status === "verified_pr_skipped" ||
              f.status === "pr_failed"
          );
          prItems.push(...relevant);
        } catch (e) {
          console.warn("Could not load findings for initialScanId:", e);
        }
      }

      // Also inspect recent scans from history to discover all PRs
      try {
        const historyRes = await api.listScans();
        const scans = (historyRes.scans || []).slice(0, 10);
        for (const scan of scans) {
          if (scan.scan_id === initialScanId) continue;
          try {
            const findingsRes = await api.getScanFindings(scan.scan_id);
            const scanPrs = (findingsRes.completed || []).filter(
              (f: Finding) =>
                f.pr_url ||
                f.status === "verified_pr_opened" ||
                f.status === "verified_pr_skipped" ||
                f.status === "pr_failed"
            );
            prItems.push(...scanPrs);
          } catch {
            // Ignore scan-specific fetch errors
          }
        }
      } catch (err) {
        console.warn("Could not query scan history:", err);
      }

      // Deduplicate by finding ID
      const seen = new Set<string>();
      const deduped: Finding[] = [];
      for (const item of prItems) {
        const id = item.finding_id || item.id;
        if (!seen.has(id)) {
          seen.add(id);
          deduped.push(item);
        }
      }

      setFindings(deduped);
      if (deduped.length > 0 && !selectedFinding) {
        setSelectedFinding(deduped[0]);
      }
    } catch (error) {
      console.error("Failed to load PR data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPRData();
  }, [initialScanId]);

  // Derived counts
  const openedCount = findings.filter(
    (f) => f.pr_url || f.status === "verified_pr_opened"
  ).length;
  const skippedCount = findings.filter(
    (f) => f.status === "verified_pr_skipped"
  ).length;
  const failedCount = findings.filter(
    (f) => f.status === "pr_failed"
  ).length;

  // Filtered findings
  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      // Filter tab
      if (activeFilter === "opened" && !(f.pr_url || f.status === "verified_pr_opened"))
        return false;
      if (activeFilter === "skipped" && f.status !== "verified_pr_skipped")
        return false;
      if (activeFilter === "failed" && f.status !== "pr_failed")
        return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesFile = f.file_path.toLowerCase().includes(q);
        const matchesCwe = (f.cwe_id || "").toLowerCase().includes(q);
        const matchesPrUrl = (f.pr_url || "").toLowerCase().includes(q);
        const matchesBranch = (f.branch || "").toLowerCase().includes(q);
        const matchesTitle = (f.title || "").toLowerCase().includes(q);
        if (!matchesFile && !matchesCwe && !matchesPrUrl && !matchesBranch && !matchesTitle) {
          return false;
        }
      }

      return true;
    });
  }, [findings, activeFilter, searchQuery]);

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* 1. Header Banner & Quick Metrics */}
      <motion.div variants={cardEntrance} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full border border-accent-violet/30 bg-accent-violet/10 text-accent-violet text-xs font-mono font-medium">
              <Github className="w-3.5 h-3.5" />
              <span>GitHub Pull Request Command Center</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-sans font-bold tracking-tight text-white">
              Autonomous Pull Requests
            </h1>
            <p className="text-xs text-sage-400 font-sans max-w-2xl">
              Inspect automated pull requests dispatched by CodeSage with verified patches, CWE explanations, and sandbox audit guarantees.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {initialScanId && onNavigateToScan && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigateToScan(initialScanId)}
              >
                Pipeline View →
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={loadPRData}
              loading={refreshing}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Sync GitHub State
            </Button>
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3.5 space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-sage-400 font-bold block">
              Pull Requests Opened
            </span>
            <div className="flex items-center gap-2">
              <GitPullRequest className="w-4 h-4 text-accent-violet" />
              <span className="text-xl font-mono font-bold text-white">{openedCount}</span>
            </div>
          </Card>

          <Card className="p-3.5 space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-sage-400 font-bold block">
              Verified Local Fixes
            </span>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-accent-teal" />
              <span className="text-xl font-mono font-bold text-white">{skippedCount}</span>
            </div>
          </Card>

          <Card className="p-3.5 space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-sage-400 font-bold block">
              PR Failures
            </span>
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-400" />
              <span className="text-xl font-mono font-bold text-white">{failedCount}</span>
            </div>
          </Card>

          <Card className="p-3.5 space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-sage-400 font-bold block">
              Fix Verification Rate
            </span>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xl font-mono font-bold text-emerald-400">
                {findings.length > 0
                  ? `${Math.round(((openedCount + skippedCount) / findings.length) * 100)}%`
                  : "100%"}
              </span>
            </div>
          </Card>
        </div>
      </motion.div>

      {/* 2. Controls & Search Filter Bar */}
      <motion.div variants={cardEntrance} className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-sage-900 border border-white/[0.08] w-full sm:w-auto font-mono text-xs">
          {[
            { id: "all", label: "All Items", count: findings.length },
            { id: "opened", label: "PRs Opened", count: openedCount },
            { id: "skipped", label: "Verified Local", count: skippedCount },
            { id: "failed", label: "PR Failed", count: failedCount },
          ].map((tab) => {
            const active = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id as typeof activeFilter)}
                className={clsx(
                  "px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5",
                  active
                    ? "bg-accent-violet/20 text-white shadow-sm border border-accent-violet/30"
                    : "text-sage-400 hover:text-sage-200"
                )}
              >
                <span>{tab.label}</span>
                <span className="text-[10px] opacity-70">({tab.count})</span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-sage-500">
            <Search className="w-3.5 h-3.5" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by file, CWE, branch, or PR..."
            className="w-full pl-9 pr-3 py-1.5 bg-sage-900 border border-white/[0.08] rounded-xl text-sage-200 placeholder-sage-500 font-mono text-xs focus:outline-none focus:border-accent-violet/50"
          />
        </div>
      </motion.div>

      {/* 3. Main Split View: Left List / Right Inspection Panel */}
      {loading ? (
        <Card className="p-12 text-center space-y-3 font-mono">
          <RefreshCw className="w-6 h-6 animate-spin text-accent-violet mx-auto" />
          <p className="text-xs text-sage-400">Querying GitHub PR repository records...</p>
        </Card>
      ) : findings.length === 0 ? (
        <Card className="p-12">
          <EmptyState
            icon={<GitPullRequest className="w-8 h-8 text-accent-violet" />}
            title="No Pull Requests Recorded"
            description="Run an autonomous audit targeting a remote GitHub repository to generate verified pull requests."
            actionLabel="Start New Scan"
            onAction={onNavigateToDashboard}
          />
        </Card>
      ) : filteredFindings.length === 0 ? (
        <Card className="p-10 text-center space-y-2 font-mono">
          <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" />
          <p className="text-sm font-sans font-semibold text-white">No items match your filter criteria.</p>
          <p className="text-xs text-sage-400">Try adjusting your search terms or filter selection.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: PR & Remediation Cards List (5 cols) */}
          <div className="lg:col-span-5 space-y-3">
            {filteredFindings.map((finding) => {
              const id = finding.finding_id || finding.id;
              const isSelected = (selectedFinding?.finding_id || selectedFinding?.id) === id;
              const prUrl = finding.pr_url;
              const isOpened = Boolean(prUrl) || finding.status === "verified_pr_opened";
              const isSkipped = finding.status === "verified_pr_skipped";

              const prNumberMatch = prUrl?.match(/pull\/(\d+)/);
              const prNum = finding.pr_number || (prNumberMatch ? prNumberMatch[1] : null);

              return (
                <div
                  key={id}
                  onClick={() => setSelectedFinding(finding)}
                  className={clsx(
                    "p-4 rounded-xl border cursor-pointer transition-all space-y-2.5",
                    isSelected
                      ? "bg-sage-900 border-accent-violet/40 shadow-[0_0_16px_rgba(139,92,246,0.12)]"
                      : "bg-sage-950/70 border-white/[0.06] hover:border-white/[0.15] hover:bg-sage-900/40"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={clsx(
                          "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border",
                          isOpened
                            ? "bg-accent-violet/15 border-accent-violet/30 text-accent-violet"
                            : isSkipped
                            ? "bg-accent-teal/15 border-accent-teal/30 text-accent-teal"
                            : "bg-rose-500/15 border-rose-500/30 text-rose-400"
                        )}
                      >
                        <GitPullRequest className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-mono text-xs font-bold text-white">
                        {prNum ? `PR #${prNum}` : isSkipped ? "Local Fix" : "Failed PR"}
                      </span>
                    </div>

                    <Badge
                      variant={isOpened ? "violet" : isSkipped ? "teal" : "critical"}
                      size="sm"
                      dot={isOpened}
                    >
                      {isOpened ? "Open" : isSkipped ? "Verified Local" : "Failed"}
                    </Badge>
                  </div>

                  <p className="text-xs font-sans font-medium text-sage-200 line-clamp-1">
                    {finding.title || (finding.cwe_id ? `Fix ${finding.cwe_id} in ${finding.file_path}` : finding.file_path)}
                  </p>

                  <div className="flex items-center justify-between font-mono text-[11px] text-sage-400 pt-1 border-t border-white/[0.04]">
                    <span className="truncate max-w-[180px]">{finding.file_path}</span>
                    <span className="text-accent-orange font-semibold">
                      {finding.branch || "fix-branch"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Detailed Selected PR Workflow & Panel (7 cols) */}
          <div className="lg:col-span-7 space-y-6 sticky top-6">
            {selectedFinding ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedFinding.finding_id || selectedFinding.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-6"
                >
                  {/* Sequence Animation */}
                  <RemediationWorkflowSequence
                    isVerified={true}
                    isPrOpened={Boolean(selectedFinding.pr_url) || selectedFinding.status === "verified_pr_opened"}
                    isPrSkipped={selectedFinding.status === "verified_pr_skipped"}
                    isPrFailed={selectedFinding.status === "pr_failed"}
                    branchName={selectedFinding.branch}
                    prNumber={selectedFinding.pr_number}
                    prUrl={selectedFinding.pr_url}
                    failureReason={selectedFinding.failure_reason}
                  />

                  {/* GitHub PR Panel with Failure States */}
                  <GitHubPRPanel finding={selectedFinding} />
                </motion.div>
              </AnimatePresence>
            ) : (
              <Card className="p-8 text-center text-sage-500 font-mono text-xs">
                Select an item on the left to inspect pull request details.
              </Card>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};
