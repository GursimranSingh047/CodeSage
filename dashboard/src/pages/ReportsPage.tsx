import React, { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Download,
  Copy,
  Check,
  RefreshCw,
  GitBranch,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Terminal,
  Clock,
  ChevronDown,
  GitPullRequest,
  ExternalLink,
} from "lucide-react";
import { api } from "@/api/client";
import {
  ScanRun,
  Finding,
  ScanEvent,
  ScanHistoryItem,
  Severity,
} from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cardEntrance, staggerContainer } from "@/animations/variants";
import { clsx } from "clsx";

interface ReportsPageProps {
  initialScanId?: string | null;
  onNavigateToScan?: (scanId: string) => void;
  onStartNewScan?: () => void;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({
  initialScanId,
  onNavigateToScan,
  onStartNewScan,
}) => {
  const [availableScans, setAvailableScans] = useState<ScanHistoryItem[]>([]);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(initialScanId || null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanRun, setScanRun] = useState<ScanRun | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [events, setEvents] = useState<ScanEvent[]>([]);
  const [copiedReport, setCopiedReport] = useState(false);
  const [activeSection, setActiveSection] = useState<
    "overview" | "findings" | "severity" | "timeline" | "triage" | "fixes" | "verification" | "pr"
  >("overview");

  const loadScansList = async () => {
    try {
      const res = await api.listScans();
      const list = res.scans || [];
      setAvailableScans(list);
      if (!selectedScanId && list.length > 0) {
        setSelectedScanId(list[0].scan_id);
      }
    } catch (err) {
      console.warn("Could not load scan list:", err);
    }
  };

  const loadReportData = async (scanId: string) => {
    try {
      setRefreshing(true);
      const [statusRes, findingsRes, eventsRes] = await Promise.allSettled([
        api.getScanStatus(scanId),
        api.getScanFindings(scanId),
        api.getScanEvents(scanId),
      ]);

      if (statusRes.status === "fulfilled") {
        setScanRun(statusRes.value);
      }
      if (findingsRes.status === "fulfilled") {
        setFindings(findingsRes.value.completed || []);
      }
      if (eventsRes.status === "fulfilled") {
        setEvents(eventsRes.value.events || []);
      }
    } catch (err) {
      console.error("Failed to load report data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadScansList();
  }, []);

  useEffect(() => {
    if (selectedScanId) {
      loadReportData(selectedScanId);
    } else {
      setLoading(false);
    }
  }, [selectedScanId]);

  const handleDownloadMarkdown = async () => {
    if (!selectedScanId) return;
    try {
      const markdown = await api.getScanReport(selectedScanId);
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `codesage-report-${selectedScanId}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download markdown report:", err);
    }
  };

  const handleCopyMarkdown = async () => {
    if (!selectedScanId) return;
    try {
      const markdown = await api.getScanReport(selectedScanId);
      await navigator.clipboard.writeText(markdown);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    } catch (err) {
      console.error("Failed to copy markdown report:", err);
    }
  };

  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0,
    };
    for (const f of findings) {
      const sev = (f.severity || "medium").toLowerCase() as Severity;
      if (counts[sev] !== undefined) {
        counts[sev]++;
      }
    }
    return counts;
  }, [findings]);

  const totalFindings = findings.length;

  const durationStr = useMemo(() => {
    if (!scanRun?.finished || !scanRun?.started) return "—";
    const sec = Math.round((scanRun.finished - scanRun.started) * 10) / 10;
    if (sec < 60) return `${sec}s`;
    return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
  }, [scanRun]);

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6 max-w-7xl mx-auto"
    >
      {/* 1. Header Bar */}
      <motion.div variants={cardEntrance} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-[#292D2A] bg-[#101211] text-[#8CFF8C] text-xs font-mono font-medium">
              <span className="w-2 h-2 rounded-full bg-[#8CFF8C] animate-pulse" />
              <span>Security & Engineering Audit Dossier</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-sans font-bold tracking-tight text-[#F4F5F4]">
              Scan Audit Report
            </h1>
            <p className="text-xs text-[#A5AAA6] font-sans max-w-2xl">
              Comprehensive security verification report with AST triage evidence, unified patch diffs, and cryptographic sandbox receipts.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {availableScans.length > 0 && (
              <div className="relative">
                <select
                  value={selectedScanId || ""}
                  onChange={(e) => setSelectedScanId(e.target.value)}
                  className="pl-3 pr-8 py-2 rounded-xl bg-[#151716] border border-[#292D2A] text-[#F4F5F4] font-mono text-xs appearance-none focus:outline-none focus:border-[#8CFF8C] cursor-pointer"
                >
                  {availableScans.map((s) => (
                    <option key={s.scan_id} value={s.scan_id}>
                      {s.repo_url.split("/").pop()} ({s.scan_id.slice(0, 8)}) — {s.status}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-[#666C68] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}

            {selectedScanId && onNavigateToScan && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigateToScan(selectedScanId)}
              >
                Pipeline View →
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => selectedScanId && loadReportData(selectedScanId)}
              loading={refreshing}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              disabled={!selectedScanId}
            >
              Refresh
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyMarkdown}
              icon={copiedReport ? <Check className="w-3.5 h-3.5 text-[#8CFF8C]" /> : <Copy className="w-3.5 h-3.5" />}
              disabled={!selectedScanId}
            >
              {copiedReport ? "Copied" : "Copy Markdown"}
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleDownloadMarkdown}
              icon={<Download className="w-3.5 h-3.5" />}
              disabled={!selectedScanId}
            >
              Export Report (.md)
            </Button>
          </div>
        </div>
      </motion.div>

      {/* 2. Main Content */}
      {loading ? (
        <div className="surface-card rounded-2xl p-12 text-center space-y-3 font-mono border border-[#292D2A]">
          <RefreshCw className="w-6 h-6 animate-spin text-[#8CFF8C] mx-auto" />
          <p className="text-xs text-[#A5AAA6]">Compiling security audit report...</p>
        </div>
      ) : !selectedScanId || !scanRun ? (
        <div className="surface-card rounded-2xl p-12 border border-[#292D2A] text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-[#151716] border border-[#292D2A] flex items-center justify-center text-[#8CFF8C] mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-base font-sans font-bold text-[#F4F5F4]">No Report Available</h3>
          <p className="text-xs text-[#A5AAA6] font-sans max-w-sm mx-auto">
            Run an autonomous security audit to generate executive and engineering audit reports.
          </p>
          {onStartNewScan && (
            <Button variant="primary" size="sm" onClick={onStartNewScan}>
              Start New Scan
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section Navigation Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#101211] border border-[#292D2A] overflow-x-auto select-none font-mono text-xs">
            {[
              { id: "overview", label: "Overview" },
              { id: "severity", label: "Severity Breakdown" },
              { id: "findings", label: `Findings (${findings.length})` },
              { id: "triage", label: "AI Analysis" },
              { id: "fixes", label: "Fixes & Patches" },
              { id: "verification", label: "Verification" },
              { id: "pr", label: "Pull Requests" },
              { id: "timeline", label: `Timeline (${events.length})` },
            ].map((tab) => {
              const active = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSection(tab.id as typeof activeSection)}
                  className={clsx(
                    "px-3.5 py-2 rounded-xl font-medium transition-all whitespace-nowrap cursor-pointer",
                    active
                      ? "bg-[#16351F] text-[#8CFF8C] border border-[#8CFF8C]/35 font-semibold"
                      : "text-[#A5AAA6] hover:text-[#F4F5F4]"
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* SECTION 1: OVERVIEW */}
          {activeSection === "overview" && (
            <motion.div variants={cardEntrance} className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="surface-card rounded-2xl p-4 space-y-1 border border-[#292D2A]">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#666C68] font-bold block">
                    Total Findings
                  </span>
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-[#FF5555]" />
                    <span className="text-2xl font-mono font-bold text-[#F4F5F4]">
                      {totalFindings}
                    </span>
                  </div>
                </div>

                <div className="surface-card rounded-2xl p-4 space-y-1 border border-[#292D2A]">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#666C68] font-bold block">
                    Verified Clean Fixes
                  </span>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#8CFF8C]" />
                    <span className="text-2xl font-mono font-bold text-[#8CFF8C]">
                      {findings.filter((f) => f.status?.includes("verified")).length}
                    </span>
                  </div>
                </div>

                <div className="surface-card rounded-2xl p-4 space-y-1 border border-[#292D2A]">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#666C68] font-bold block">
                    False Positives Filtered
                  </span>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#A5AAA6]" />
                    <span className="text-2xl font-mono font-bold text-[#F4F5F4]">
                      {findings.filter((f) => f.status === "false_positive").length}
                    </span>
                  </div>
                </div>

                <div className="surface-card rounded-2xl p-4 space-y-1 border border-[#292D2A]">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#666C68] font-bold block">
                    Scan Duration
                  </span>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#666C68]" />
                    <span className="text-2xl font-mono font-bold text-[#F4F5F4]">
                      {durationStr}
                    </span>
                  </div>
                </div>
              </div>

              {/* Target Metadata Dossier */}
              <div className="p-6 rounded-2xl surface-card border border-[#292D2A] space-y-4">
                <h3 className="text-sm font-mono uppercase tracking-wider text-[#A5AAA6] font-bold flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#8CFF8C]" />
                  <span>Target Repository Metadata</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
                  <div className="p-4 rounded-xl bg-[#151716] border border-[#292D2A] space-y-1">
                    <span className="text-[10px] uppercase text-[#666C68] font-bold block">Repository</span>
                    <span className="text-[#F4F5F4] font-semibold truncate block">{scanRun.repo_url}</span>
                  </div>

                  <div className="p-4 rounded-xl bg-[#151716] border border-[#292D2A] space-y-1">
                    <span className="text-[10px] uppercase text-[#666C68] font-bold block">Branch</span>
                    <div className="flex items-center gap-1.5 text-[#8CFF8C]">
                      <GitBranch className="w-3.5 h-3.5" />
                      <span>{scanRun.branch || "main"}</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-[#151716] border border-[#292D2A] space-y-1">
                    <span className="text-[10px] uppercase text-[#666C68] font-bold block">Scan ID</span>
                    <span className="text-[#F4F5F4] font-mono truncate block">{scanRun.id}</span>
                  </div>

                  <div className="p-4 rounded-xl bg-[#151716] border border-[#292D2A] space-y-1">
                    <span className="text-[10px] uppercase text-[#666C68] font-bold block">Final Status</span>
                    <span className="text-[#8CFF8C] font-bold uppercase block">{scanRun.status}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* SECTION 2: SEVERITY BREAKDOWN */}
          {activeSection === "severity" && (
            <motion.div variants={cardEntrance} className="space-y-4">
              <div className="p-6 rounded-2xl surface-card border border-[#292D2A] space-y-5">
                <h3 className="text-sm font-sans font-bold text-[#F4F5F4]">Severity Breakdown</h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono text-xs">
                  {(["critical", "high", "medium", "low", "informational"] as Severity[]).map((sev) => {
                    const count = severityCounts[sev];
                    return (
                      <div key={sev} className="p-4 rounded-xl bg-[#151716] border border-[#292D2A] space-y-1 text-center">
                        <span className="text-[10px] uppercase font-bold text-[#666C68] block">{sev}</span>
                        <span className="text-2xl font-bold text-[#F4F5F4]">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* SECTION 3: FINDINGS */}
          {activeSection === "findings" && (
            <motion.div variants={cardEntrance} className="space-y-3">
              {findings.map((f, idx) => (
                <div key={idx} className="p-4 rounded-xl surface-card border border-[#292D2A] flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={f.severity || "medium"} size="xs">{f.severity}</Badge>
                      <span className="font-sans font-bold text-xs text-[#F4F5F4]">{f.cwe_id || "Vulnerability"}</span>
                    </div>
                    <p className="text-xs font-mono text-[#666C68]">{f.file_path}:{f.line_number}</p>
                  </div>
                  <span className="text-xs font-mono text-[#A5AAA6]">{f.status}</span>
                </div>
              ))}
            </motion.div>
          )}

          {/* SECTION 4: AI ANALYSIS */}
          {activeSection === "triage" && (
            <motion.div variants={cardEntrance} className="space-y-4">
              {findings.map((f, idx) => (
                <div key={idx} className="p-5 rounded-xl surface-card border border-[#292D2A] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-sans font-bold text-xs text-[#F4F5F4]">{f.cwe_id} ({f.file_path}:{f.line_number})</span>
                    <Badge variant={f.severity || "medium"} size="xs">{f.severity}</Badge>
                  </div>
                  <p className="text-xs text-[#A5AAA6] font-sans leading-relaxed">{f.reasoning || f.raw_message}</p>
                </div>
              ))}
            </motion.div>
          )}

          {/* SECTION 5: FIXES & PATCHES */}
          {activeSection === "fixes" && (
            <motion.div variants={cardEntrance} className="space-y-4">
              <div className="p-6 rounded-2xl surface-card border border-[#292D2A] space-y-3">
                <h4 className="text-sm font-sans font-bold text-[#F4F5F4]">Synthesized Verified Patches</h4>
                <p className="text-xs text-[#A5AAA6]">
                  {findings.filter((f) => f.status?.includes("verified")).length} patch(es) synthesized and verified against AST regression suites.
                </p>
              </div>
            </motion.div>
          )}

          {/* SECTION 6: VERIFICATION */}
          {activeSection === "verification" && (
            <motion.div variants={cardEntrance} className="space-y-4">
              <div className="p-6 rounded-2xl surface-card border border-[#292D2A] space-y-3">
                <h4 className="text-sm font-sans font-bold text-[#F4F5F4]">Sandbox Verification Protocol</h4>
                <p className="text-xs text-[#A5AAA6]">
                  Each synthesized patch is injected into an isolated Docker workspace to confirm clean static re-scans and zero test regressions.
                </p>
              </div>
            </motion.div>
          )}

          {/* SECTION 7: PULL REQUESTS */}
          {activeSection === "pr" && (
            <motion.div variants={cardEntrance} className="space-y-4">
              {findings.filter((f) => f.pr_url || f.status === "verified_pr_opened").map((f, idx) => (
                <div key={idx} className="p-5 rounded-xl surface-card border border-[#292D2A] flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <GitPullRequest className="w-4 h-4 text-[#8CFF8C]" />
                      <span className="font-bold text-xs text-[#F4F5F4]">{f.title || f.cwe_id}</span>
                    </div>
                    <p className="text-xs font-mono text-[#666C68]">{f.file_path}</p>
                  </div>
                  {f.pr_url && (
                    <a href={f.pr_url} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="xs" icon={<ExternalLink className="w-3.5 h-3.5" />}>
                        Open PR
                      </Button>
                    </a>
                  )}
                </div>
              ))}
            </motion.div>
          )}

          {/* SECTION 8: TIMELINE */}
          {activeSection === "timeline" && (
            <motion.div variants={cardEntrance} className="space-y-2">
              <div className="p-4 rounded-xl bg-[#080909] border border-[#292D2A] font-mono text-xs space-y-1.5 max-h-96 overflow-y-auto">
                {events.map((e, idx) => (
                  <div key={idx} className="text-[#F4F5F4] flex items-start gap-2">
                    <span className="text-[#666C68] shrink-0">[{e.ts ? new Date(e.ts).toLocaleTimeString() : "—"}]</span>
                    <span>{e.message || e.type}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      )}
    </motion.div>
  );
};
