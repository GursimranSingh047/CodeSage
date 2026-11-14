import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ShieldAlert,
  RefreshCw,
  FolderGit2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { FindingFilters } from "@/components/findings/FindingFilters";
import { FindingList, getFindingId } from "@/components/findings/FindingList";
import { FindingDetailPanel } from "@/components/findings/FindingDetailPanel";
import { Button } from "@/components/ui/Button";
import { api } from "@/api/client";
import { Finding, FindingArtifacts, ScanHistoryItem } from "@/types";
import { staggerContainer, cardEntrance } from "@/animations/variants";

interface FindingsPageProps {
  initialScanId?: string | null;
  onNavigateToScan?: (scanId: string) => void;
}

export const FindingsPage: React.FC<FindingsPageProps> = ({
  initialScanId,
  onNavigateToScan,
}) => {
  const [scans, setScans] = useState<ScanHistoryItem[]>([]);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(initialScanId || null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected finding state
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [artifactsCache, setArtifactsCache] = useState<Record<string, FindingArtifacts>>({});
  const [loadingArtifacts, setLoadingArtifacts] = useState(false);

  // Filter states
  const [search, setSearch] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState("all");
  const [selectedScanner, setSelectedScanner] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedFile, setSelectedFile] = useState("all");

  // Load available scans list
  useEffect(() => {
    api
      .listScans()
      .then((res) => {
        const loaded = res.scans || [];
        setScans(loaded);
        if (!selectedScanId && loaded.length > 0) {
          // Default to the first scan with completed findings, or newest scan
          const withFindings = loaded.find(
            (s) => Object.values(s.counts || {}).reduce((a, b) => a + b, 0) > 0
          );
          setSelectedScanId(withFindings ? withFindings.scan_id : loaded[0].scan_id);
        }
      })
      .catch((err) => {
        console.warn("Failed to list scans for Findings page:", err);
      });
  }, [selectedScanId]);

  // Fetch findings for selected scan
  const fetchFindings = useCallback(async (scanId: string) => {
    try {
      setLoading(true);
      setError(null);
      setSelectedFinding(null);
      const res = await api.getScanFindings(scanId);
      const list = res.completed || [];
      setFindings(list);
      // Auto-select first finding if available on desktop
      if (list.length > 0 && window.innerWidth >= 1024) {
        setSelectedFinding(list[0]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load findings";
      setError(msg);
      setFindings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedScanId) {
      fetchFindings(selectedScanId);
    } else {
      setLoading(false);
    }
  }, [selectedScanId, fetchFindings]);

  // Fetch artifacts when a finding is selected
  useEffect(() => {
    if (!selectedScanId || !selectedFinding) return;

    const fid = getFindingId(selectedFinding);
    if (artifactsCache[fid]) {
      return; // Already cached
    }

    setLoadingArtifacts(true);
    api
      .getFindingArtifacts(selectedScanId, fid)
      .then((data) => {
        setArtifactsCache((prev) => ({
          ...prev,
          [fid]: data,
        }));
      })
      .catch(() => {
        // Artifacts might be 404 for false positives or early errors; cache empty
        setArtifactsCache((prev) => ({
          ...prev,
          [fid]: {},
        }));
      })
      .finally(() => {
        setLoadingArtifacts(false);
      });
  }, [selectedScanId, selectedFinding, artifactsCache]);

  const handleReviewDecision = async (decision: "approved" | "rejected", notes?: string) => {
    if (!selectedScanId || !selectedFinding) return;
    const fid = getFindingId(selectedFinding);
    try {
      await api.reviewFinding(selectedScanId, fid, { decision, notes });
      const newStatus = decision === "approved" ? "verified_pr_opened" : "false_positive";
      setSelectedFinding((prev) => (prev ? { ...prev, status: newStatus } : null));
      setFindings((prev) =>
        prev.map((f) => (getFindingId(f) === fid ? { ...f, status: newStatus } : f))
      );
    } catch (err) {
      console.error("Failed to submit review decision:", err);
    }
  };

  // Extract unique files list from findings
  const availableFiles = useMemo(() => {
    const files = new Set<string>();
    findings.forEach((f) => {
      if (f.file_path) files.add(f.file_path);
    });
    return Array.from(files).sort();
  }, [findings]);

  // Filter findings according to criteria
  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesTitle = (f.cwe_id || "").toLowerCase().includes(q);
        const matchesMsg = (f.raw_message || "").toLowerCase().includes(q);
        const matchesPath = (f.file_path || "").toLowerCase().includes(q);
        const matchesId = getFindingId(f).toLowerCase().includes(q);
        const matchesReasoning = (f.reasoning || "").toLowerCase().includes(q);
        if (!matchesTitle && !matchesMsg && !matchesPath && !matchesId && !matchesReasoning) {
          return false;
        }
      }

      // Severity
      if (selectedSeverity !== "all") {
        const sev = (f.severity || "medium").toLowerCase();
        if (selectedSeverity === "informational") {
          if (sev !== "informational" && sev !== "info") return false;
        } else if (sev !== selectedSeverity) {
          return false;
        }
      }

      // Scanner
      if (selectedScanner !== "all") {
        if (f.tool_source?.toLowerCase() !== selectedScanner.toLowerCase()) {
          return false;
        }
      }

      // Status
      if (selectedStatus !== "all") {
        const stat = (f.status || "").toLowerCase();
        if (selectedStatus === "false_positive" && stat !== "false_positive") {
          return false;
        }
        if (selectedStatus === "confirmed" && stat === "false_positive") {
          return false;
        }
        if (selectedStatus === "verified" && !stat.includes("verified")) {
          return false;
        }
        if (selectedStatus === "needs_human_review" && stat !== "needs_human_review") {
          return false;
        }
        if (selectedStatus === "failed" && !stat.includes("failed")) {
          return false;
        }
      }

      // File
      if (selectedFile !== "all" && f.file_path !== selectedFile) {
        return false;
      }

      return true;
    });
  }, [findings, search, selectedSeverity, selectedScanner, selectedStatus, selectedFile]);

  const handleResetFilters = () => {
    setSearch("");
    setSelectedSeverity("all");
    setSelectedScanner("all");
    setSelectedStatus("all");
    setSelectedFile("all");
  };

  const currentArtifacts = selectedFinding
    ? artifactsCache[getFindingId(selectedFinding)] || null
    : null;

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6 max-w-7xl mx-auto"
    >
      {/* 1. Header Toolbar: Scan Selector + Actions */}
      <motion.div
        variants={cardEntrance}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1 border-b border-white/[0.06]"
      >
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-accent-orange/10 border border-accent-orange/20 text-accent-orange text-xs font-mono font-medium">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Codebase Security Findings</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-sans font-bold text-white tracking-tight">
            Findings Explorer
          </h1>
        </div>

        {/* Scan Run Picker Dropdown */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-sage-900 border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs font-mono">
            <span className="text-sage-400 hidden sm:inline">Active Run:</span>
            <select
              value={selectedScanId || ""}
              onChange={(e) => setSelectedScanId(e.target.value)}
              className="bg-transparent text-white font-mono text-xs focus:outline-none cursor-pointer max-w-[220px] truncate"
            >
              {scans.length === 0 ? (
                <option value="">No scans available</option>
              ) : (
                scans.map((s) => (
                  <option key={s.scan_id} value={s.scan_id} className="bg-sage-950 text-white">
                    #{s.scan_id.slice(0, 8)} ({s.repo_url.split("/").slice(-1)[0]}) [{s.status}]
                  </option>
                ))
              )}
            </select>
          </div>

          {selectedScanId && onNavigateToScan && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigateToScan(selectedScanId)}
              icon={<ExternalLink className="w-3.5 h-3.5 text-accent-orange" />}
              className="text-xs font-mono hidden md:inline-flex"
            >
              View Pipeline
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => selectedScanId && fetchFindings(selectedScanId)}
            loading={loading}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />}
            className="text-xs font-mono"
          >
            Refresh
          </Button>
        </div>
      </motion.div>

      {/* 2. Filter Bar */}
      <motion.div variants={cardEntrance}>
        <FindingFilters
          search={search}
          onSearchChange={setSearch}
          selectedSeverity={selectedSeverity}
          onSeverityChange={setSelectedSeverity}
          selectedScanner={selectedScanner}
          onScannerChange={setSelectedScanner}
          selectedStatus={selectedStatus}
          onStatusChange={setSelectedStatus}
          selectedFile={selectedFile}
          onFileChange={setSelectedFile}
          availableFiles={availableFiles}
          totalCount={findings.length}
          filteredCount={filteredFindings.length}
          onReset={handleResetFilters}
        />
      </motion.div>

      {/* 3. Main Split Content Area */}
      {error ? (
        <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-start gap-3 text-rose-300 text-xs font-mono">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <div className="font-semibold text-rose-200">Unable to Load Scan Findings</div>
            <p>{error}</p>
            <Button
              variant="outline"
              size="xs"
              onClick={() => selectedScanId && fetchFindings(selectedScanId)}
            >
              Retry
            </Button>
          </div>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-4 rounded-xl glass-panel h-24 animate-pulse" />
            ))}
          </div>
          <div className="lg:col-span-7">
            <div className="rounded-xl glass-panel h-96 animate-pulse" />
          </div>
        </div>
      ) : findings.length === 0 ? (
        <div className="p-12 text-center rounded-2xl glass-panel border border-white/[0.06] space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-sage-900 border border-white/[0.08] flex items-center justify-center text-sage-500 mx-auto">
            <FolderGit2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-sans font-semibold text-white">
            No Findings Discovered
          </h3>
          <p className="text-xs text-sage-400 font-sans max-w-sm mx-auto leading-relaxed">
            This repository scan completed with zero security vulnerabilities or findings.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Finding List (Responsive: hidden on mobile if detail active) */}
          <div
            className={`lg:col-span-5 ${
              selectedFinding ? "hidden lg:block" : "block"
            }`}
          >
            <FindingList
              findings={filteredFindings}
              selectedFindingId={selectedFinding ? getFindingId(selectedFinding) : null}
              onSelectFinding={setSelectedFinding}
            />
          </div>

          {/* Right Column: Finding Detail Panel */}
          <div
            className={`lg:col-span-7 ${
              !selectedFinding ? "hidden lg:block" : "block"
            }`}
          >
            <FindingDetailPanel
              finding={selectedFinding}
              artifacts={currentArtifacts}
              loadingArtifacts={loadingArtifacts}
              onClose={() => setSelectedFinding(null)}
              onReviewDecision={handleReviewDecision}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
};
