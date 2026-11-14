import React, { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  History,
  Search,
  RefreshCw,
  GitBranch,
  Clock,
  ShieldAlert,
  ArrowUpDown,
  FileText,
  Terminal,
  Layers,
  ChevronRight,
  Filter,
} from "lucide-react";
import { api } from "@/api/client";
import { ScanHistoryItem, ScanStatus } from "@/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { cardEntrance, staggerContainer } from "@/animations/variants";
import { clsx } from "clsx";

interface HistoryPageProps {
  onSelectScan: (scanId: string) => void;
  onViewReport: (scanId: string) => void;
  onViewFindings: (scanId: string) => void;
  onStartNewScan?: () => void;
}

type SortField = "date" | "findings" | "duration";
type SortOrder = "asc" | "desc";

export const HistoryPage: React.FC<HistoryPageProps> = ({
  onSelectScan,
  onViewReport,
  onViewFindings,
  onStartNewScan,
}) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scans, setScans] = useState<ScanHistoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const fetchHistory = async () => {
    try {
      setRefreshing(true);
      const res = await api.listScans();
      setScans(res.scans || []);
    } catch (err) {
      console.error("Failed to fetch scan history:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  // Filter & Sort Logic
  const filteredAndSortedScans = useMemo(() => {
    return scans
      .filter((scan) => {
        // Status filter
        if (statusFilter !== "all" && scan.status !== statusFilter) {
          return false;
        }

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesRepo = scan.repo_url.toLowerCase().includes(q);
          const matchesId = scan.scan_id.toLowerCase().includes(q);
          const matchesBranch = (scan.branch || "").toLowerCase().includes(q);
          if (!matchesRepo && !matchesId && !matchesBranch) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortField === "date") {
          diff = (a.started || 0) - (b.started || 0);
        } else if (sortField === "findings") {
          const aCount = Object.values(a.counts || {}).reduce((sum, n) => sum + (typeof n === "number" ? n : 0), 0);
          const bCount = Object.values(b.counts || {}).reduce((sum, n) => sum + (typeof n === "number" ? n : 0), 0);
          diff = aCount - bCount;
        } else if (sortField === "duration") {
          const aDur = (a.finished && a.started) ? a.finished - a.started : 0;
          const bDur = (b.finished && b.started) ? b.finished - b.started : 0;
          diff = aDur - bDur;
        }
        return sortOrder === "desc" ? -diff : diff;
      });
  }, [scans, statusFilter, searchQuery, sortField, sortOrder]);

  const formatDuration = (started: number, finished?: number | null) => {
    if (!finished || !started || finished <= started) return "—";
    const sec = Math.round((finished - started) * 10) / 10;
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    const rem = Math.round(sec % 60);
    return `${min}m ${rem}s`;
  };

  const formatDate = (ts: number) => {
    if (!ts) return "—";
    const date = new Date(ts * 1000);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: ScanStatus) => {
    switch (status) {
      case "complete":
        return <Badge variant="success" size="sm" dot>Complete</Badge>;
      case "running":
        return <Badge variant="violet" size="sm" dot>Running</Badge>;
      case "queued":
        return <Badge variant="warning" size="sm">Queued</Badge>;
      case "cancelled":
        return <Badge variant="neutral" size="sm">Cancelled</Badge>;
      case "failed":
        return <Badge variant="critical" size="sm">Failed</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{status}</Badge>;
    }
  };

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* 1. Header Banner */}
      <motion.div variants={cardEntrance} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full border border-accent-teal/30 bg-accent-teal/10 text-accent-teal text-xs font-mono font-medium">
              <History className="w-3.5 h-3.5" />
              <span>Durable Audit Archives</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-sans font-bold tracking-tight text-white">
              Scan Run History
            </h1>
            <p className="text-xs text-sage-400 font-sans max-w-2xl">
              Chronological log of autonomous vulnerability scans, incremental hashes, and cryptographic verification receipts.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchHistory}
              loading={refreshing}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Refresh
            </Button>
            {onStartNewScan && (
              <Button
                variant="primary"
                size="sm"
                onClick={onStartNewScan}
                icon={<Terminal className="w-3.5 h-3.5" />}
              >
                New Scan
              </Button>
            )}
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3.5 space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-sage-400 font-bold block">
              Total Recorded Scans
            </span>
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-accent-teal" />
              <span className="text-xl font-mono font-bold text-white">{scans.length}</span>
            </div>
          </Card>

          <Card className="p-3.5 space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-sage-400 font-bold block">
              Completed Audits
            </span>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="text-xl font-mono font-bold text-emerald-400">
                {scans.filter((s) => s.status === "complete").length}
              </span>
            </div>
          </Card>

          <Card className="p-3.5 space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-sage-400 font-bold block">
              Active / Queued
            </span>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-accent-violet animate-pulse" />
              <span className="text-xl font-mono font-bold text-accent-violet">
                {scans.filter((s) => s.status === "running" || s.status === "queued").length}
              </span>
            </div>
          </Card>

          <Card className="p-3.5 space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-sage-400 font-bold block">
              Terminated / Failed
            </span>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
              <span className="text-xl font-mono font-bold text-rose-400">
                {scans.filter((s) => s.status === "failed" || s.status === "cancelled").length}
              </span>
            </div>
          </Card>
        </div>
      </motion.div>

      {/* 2. Controls, Search, Sort & Filters Bar */}
      <motion.div
        variants={cardEntrance}
        className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-2xl glass-panel border border-white/[0.06]"
      >
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-sage-500">
            <Search className="w-3.5 h-3.5" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search repository, branch, or scan ID..."
            className="w-full pl-9 pr-3 py-1.5 bg-sage-900 border border-white/[0.08] rounded-xl text-sage-200 placeholder-sage-500 font-mono text-xs focus:outline-none focus:border-accent-teal/50"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 font-mono text-xs">
          <div className="flex items-center gap-1 text-sage-400 text-[11px] mr-1">
            <Filter className="w-3 h-3" />
            <span>Filter:</span>
          </div>
          {["all", "complete", "running", "failed", "cancelled"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={clsx(
                "px-2.5 py-1 rounded-lg capitalize font-medium transition-all",
                statusFilter === st
                  ? "bg-accent-teal/20 text-accent-teal border border-accent-teal/30"
                  : "bg-sage-900/60 text-sage-400 hover:text-white border border-white/[0.04]"
              )}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <div className="flex items-center gap-1 text-sage-400 text-[11px]">
            <ArrowUpDown className="w-3 h-3" />
            <span>Sort:</span>
          </div>
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            className="px-2.5 py-1 rounded-lg bg-sage-900 border border-white/[0.08] text-sage-200 text-xs focus:outline-none focus:border-accent-teal/50"
          >
            <option value="date">Date & Time</option>
            <option value="findings">Findings Count</option>
            <option value="duration">Duration</option>
          </select>
          <button
            type="button"
            onClick={() => setSortOrder((o) => (o === "desc" ? "asc" : "desc"))}
            className="px-2 py-1 rounded-lg bg-sage-900 border border-white/[0.08] text-sage-300 hover:text-white text-xs"
            title="Toggle sort direction"
          >
            {sortOrder === "desc" ? "↓ Desc" : "↑ Asc"}
          </button>
        </div>
      </motion.div>

      {/* 3. History Table / Card Stream */}
      {loading ? (
        <Card className="p-12 text-center space-y-3 font-mono">
          <RefreshCw className="w-6 h-6 animate-spin text-accent-teal mx-auto" />
          <p className="text-xs text-sage-400">Loading audit history records from persistent storage...</p>
        </Card>
      ) : scans.length === 0 ? (
        <Card className="p-12">
          <EmptyState
            icon={<History className="w-8 h-8 text-accent-teal" />}
            title="No Scans Recorded"
            description="Your audit timeline is empty. Launch your first autonomous scan to monitor security history."
            actionLabel="Start Security Audit"
            onAction={onStartNewScan}
          />
        </Card>
      ) : filteredAndSortedScans.length === 0 ? (
        <Card className="p-10 text-center space-y-2 font-mono">
          <ShieldAlert className="w-6 h-6 text-amber-400 mx-auto" />
          <p className="text-sm font-sans font-semibold text-white">No scans match your search or filter.</p>
          <p className="text-xs text-sage-400">Reset your filters to see all audit history entries.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredAndSortedScans.map((scan) => {
            const findingsCount = Object.values(scan.counts || {}).reduce(
              (sum, n) => sum + (typeof n === "number" ? n : 0),
              0
            );
            const duration = formatDuration(scan.started, scan.finished);
            const dateStr = formatDate(scan.started);
            const repoDisplay =
              (typeof scan.repository_metadata?.full_name === "string" && scan.repository_metadata.full_name) ||
              scan.repo_url.split("/").slice(-2).join("/");

            return (
              <motion.div
                key={scan.scan_id}
                variants={cardEntrance}
                className="p-4 sm:p-5 rounded-2xl glass-panel-elevated border border-white/[0.08] hover:border-accent-teal/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group"
              >
                {/* Left: Metadata & Repository */}
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-sage-900 border border-white/[0.08] flex items-center justify-center text-sage-300 group-hover:text-accent-teal group-hover:border-accent-teal/30 transition-colors shrink-0 mt-0.5">
                    <Terminal className="w-5 h-5" />
                  </div>

                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-white truncate max-w-sm">
                        {repoDisplay}
                      </span>
                      {getStatusBadge(scan.status)}
                      <span className="text-[11px] font-mono text-sage-500">
                        ID: {scan.scan_id}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-sage-400">
                      <span className="flex items-center gap-1">
                        <GitBranch className="w-3.5 h-3.5 text-accent-orange" />
                        <span>{scan.branch || "main"}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-sage-500" />
                        <span>{dateStr}</span>
                      </span>
                      <span className="text-sage-400">
                        Duration: <span className="text-white font-medium">{duration}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Center / Right: Findings & Actions */}
                <div className="flex items-center justify-between md:justify-end gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-white/[0.06]">
                  {/* Findings Counter Pill */}
                  <div className="px-3 py-1.5 rounded-xl bg-sage-950 border border-white/[0.06] font-mono text-xs flex items-center gap-2">
                    <span className="text-sage-400">Findings:</span>
                    <span
                      className={clsx(
                        "font-bold",
                        findingsCount > 0 ? "text-amber-400" : "text-emerald-400"
                      )}
                    >
                      {findingsCount}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewReport(scan.scan_id)}
                      icon={<FileText className="w-3.5 h-3.5" />}
                      title="View Engineering Report"
                    >
                      Report
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onViewFindings(scan.scan_id)}
                      icon={<Layers className="w-3.5 h-3.5" />}
                      title="View Findings"
                    >
                      Findings
                    </Button>

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onSelectScan(scan.scan_id)}
                      icon={<ChevronRight className="w-3.5 h-3.5" />}
                    >
                      Pipeline
                    </Button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};
