import React, { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  History,
  Search,
  RefreshCw,
  GitBranch,
  Clock,
  ArrowUpDown,
  FileText,
  Terminal,
  Filter,
} from "lucide-react";
import { api } from "@/api/client";
import { ScanHistoryItem, ScanStatus } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
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

  const filteredAndSortedScans = useMemo(() => {
    return scans
      .filter((scan) => {
        if (statusFilter !== "all" && scan.status !== statusFilter) {
          return false;
        }

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
        return <Badge variant="green" size="sm" dot>Complete</Badge>;
      case "running":
        return <Badge variant="green" size="sm" dot>Running</Badge>;
      case "queued":
        return <Badge variant="neutral" size="sm">Queued</Badge>;
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
      className="space-y-6 max-w-7xl mx-auto"
    >
      {/* 1. Header Banner */}
      <motion.div variants={cardEntrance} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-[#292D2A] bg-[#101211] text-[#8CFF8C] text-xs font-mono font-medium">
              <span className="w-2 h-2 rounded-full bg-[#8CFF8C] animate-pulse" />
              <span>Audit Run Archives</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-sans font-bold tracking-tight text-[#F4F5F4]">
              Scan Run History
            </h1>
            <p className="text-xs text-[#A5AAA6] font-sans max-w-2xl">
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
                icon={<Terminal className="w-3.5 h-3.5 fill-current" />}
              >
                New Scan
              </Button>
            )}
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="surface-card rounded-2xl p-4 space-y-1 border border-[#292D2A]">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#666C68] font-bold block">
              Total Recorded Scans
            </span>
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-[#A5AAA6]" />
              <span className="text-xl font-mono font-bold text-[#F4F5F4]">{scans.length}</span>
            </div>
          </div>

          <div className="surface-card rounded-2xl p-4 space-y-1 border border-[#292D2A]">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#666C68] font-bold block">
              Completed Audits
            </span>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#8CFF8C]" />
              <span className="text-xl font-mono font-bold text-[#8CFF8C]">
                {scans.filter((s) => s.status === "complete").length}
              </span>
            </div>
          </div>

          <div className="surface-card rounded-2xl p-4 space-y-1 border border-[#292D2A]">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#666C68] font-bold block">
              Active / Queued
            </span>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#8CFF8C] animate-pulse" />
              <span className="text-xl font-mono font-bold text-[#8CFF8C]">
                {scans.filter((s) => s.status === "running" || s.status === "queued").length}
              </span>
            </div>
          </div>

          <div className="surface-card rounded-2xl p-4 space-y-1 border border-[#292D2A]">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#666C68] font-bold block">
              Terminated / Failed
            </span>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF5555]" />
              <span className="text-xl font-mono font-bold text-[#FF5555]">
                {scans.filter((s) => s.status === "failed" || s.status === "cancelled").length}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 2. Controls, Search, Sort & Filters Bar */}
      <motion.div
        variants={cardEntrance}
        className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3.5 rounded-2xl surface-card border border-[#292D2A]"
      >
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#666C68]">
            <Search className="w-3.5 h-3.5" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search repository, branch, or scan ID..."
            className="w-full pl-9 pr-3 py-1.5 bg-[#151716] border border-[#292D2A] rounded-xl text-[#F4F5F4] placeholder-[#666C68] font-mono text-xs focus:outline-none focus:border-[#8CFF8C] focus:ring-1 focus:ring-[#8CFF8C]"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 font-mono text-xs">
          <div className="flex items-center gap-1 text-[#666C68] text-[11px] mr-1">
            <Filter className="w-3 h-3" />
            <span>Filter:</span>
          </div>
          {["all", "complete", "running", "failed", "cancelled"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={clsx(
                "px-2.5 py-1 rounded-lg capitalize font-medium transition-all cursor-pointer",
                statusFilter === st
                  ? "bg-[#16351F] text-[#8CFF8C] border border-[#8CFF8C]/35 font-semibold"
                  : "bg-[#151716] text-[#A5AAA6] hover:text-[#F4F5F4] border border-[#292D2A]"
              )}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <div className="flex items-center gap-1 text-[#666C68] text-[11px]">
            <ArrowUpDown className="w-3 h-3" />
            <span>Sort:</span>
          </div>
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            className="px-2.5 py-1.5 rounded-xl bg-[#151716] border border-[#292D2A] text-[#F4F5F4] text-xs focus:outline-none focus:border-[#8CFF8C] cursor-pointer"
          >
            <option value="date">Date & Time</option>
            <option value="findings">Findings Count</option>
            <option value="duration">Duration</option>
          </select>
          <button
            type="button"
            onClick={() => setSortOrder((o) => (o === "desc" ? "asc" : "desc"))}
            className="px-2.5 py-1.5 rounded-xl bg-[#151716] border border-[#292D2A] text-[#A5AAA6] hover:text-[#F4F5F4] text-xs cursor-pointer"
            title="Toggle sort direction"
          >
            {sortOrder === "desc" ? "↓ Desc" : "↑ Asc"}
          </button>
        </div>
      </motion.div>

      {/* 3. History Table / Card Stream */}
      {loading ? (
        <div className="surface-card rounded-2xl p-12 text-center space-y-3 font-mono border border-[#292D2A]">
          <RefreshCw className="w-6 h-6 animate-spin text-[#8CFF8C] mx-auto" />
          <p className="text-xs text-[#A5AAA6]">Loading audit history records from persistent storage...</p>
        </div>
      ) : scans.length === 0 ? (
        <div className="surface-card rounded-2xl p-12 border border-[#292D2A] text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-[#151716] border border-[#292D2A] flex items-center justify-center text-[#8CFF8C] mx-auto">
            <History className="w-6 h-6" />
          </div>
          <h3 className="text-base font-sans font-bold text-[#F4F5F4]">No Scans Recorded</h3>
          <p className="text-xs text-[#A5AAA6] font-sans max-w-sm mx-auto">
            Your audit timeline is empty. Launch your first autonomous scan to monitor security history.
          </p>
          {onStartNewScan && (
            <Button variant="primary" size="sm" onClick={onStartNewScan}>
              Start Security Audit
            </Button>
          )}
        </div>
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
                className="surface-card rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border border-[#292D2A] hover:border-[#363C38] transition-all group"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono text-sm font-bold text-[#F4F5F4] group-hover:text-[#8CFF8C] transition-colors">
                      {repoDisplay}
                    </span>
                    {getStatusBadge(scan.status)}
                    <span className="text-[11px] font-mono text-[#666C68]">
                      ID: {scan.scan_id.slice(0, 8)}...
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono text-[#A5AAA6]">
                    <span className="flex items-center gap-1">
                      <GitBranch className="w-3.5 h-3.5 text-[#666C68]" />
                      {scan.branch || "main"}
                    </span>
                    <span>&bull;</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#666C68]" />
                      {dateStr}
                    </span>
                    <span>&bull;</span>
                    <span>Duration: {duration}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-[#292D2A]">
                  <div className="text-right font-mono text-xs">
                    <span className="text-[#F4F5F4] font-bold">{findingsCount} findings</span>
                    <span className="text-[10px] text-[#666C68] block">AST Verified</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => onViewFindings(scan.scan_id)}
                    >
                      Findings
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => onSelectScan(scan.scan_id)}
                    >
                      Pipeline
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => onViewReport(scan.scan_id)}
                      icon={<FileText className="w-3 h-3" />}
                    >
                      Report
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
