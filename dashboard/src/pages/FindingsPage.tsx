import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import {
  RefreshCw,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { FindingFilters } from "@/components/findings/FindingFilters";
import { FindingList, getFindingId, getFindingTitle } from "@/components/findings/FindingList";
import { FindingDetailWorkspace } from "@/components/findings/FindingDetailWorkspace";
import { Button } from "@/components/ui/Button";
import { api } from "@/api/client";
import { Finding, FindingArtifacts, ScanHistoryItem } from "@/types";
import { staggerContainer, cardEntrance } from "@/animations/variants";

export type NormalizedStatus =
  | "open"
  | "fix_available"
  | "verified"
  | "pr_created"
  | "resolved"
  | "false_positive";

export function getNormalizedFindingStatus(f: Finding): NormalizedStatus {
  if (!f) return "open";
  const raw = (f.status || "").toLowerCase().trim();

  // 1. False Positive
  if (raw === "false_positive") {
    return "false_positive";
  }

  // 2. Resolved / Merged
  if (raw === "resolved" || raw === "merged") {
    return "resolved";
  }

  // 3. PR Created (associated PR URL or PR number or verified_pr_opened)
  if (Boolean(f.pr_url) || (typeof f.pr_number === "number" && f.pr_number > 0) || raw === "verified_pr_opened") {
    return "pr_created";
  }

  // 4. Verified (passed verification, scan clean + tests passed)
  if (raw === "verified_pr_skipped" || raw === "verified") {
    return "verified";
  }

  // 5. Fix Available (valid patch generated, not verified or PR'd)
  if (raw === "patch_generated" || raw === "fix_available") {
    return "fix_available";
  }

  // 6. Open (default: discovered, triaged_real, needs_human_review, triage_failed, patch_generation_failed, verification_failed, etc.)
  return "open";
}

export type NormalizedSeverity = "critical" | "high" | "medium" | "low";

export function getNormalizedSeverity(sev?: string): NormalizedSeverity {
  const s = (sev || "").toLowerCase().trim();
  if (s === "critical") return "critical";
  if (s === "high") return "high";
  if (s === "low") return "low";
  return "medium";
}

interface FindingsPageProps {
  initialScanId?: string | null;
  initialFindingId?: string | null;
  onNavigateToScan?: (scanId: string) => void;
}

export const FindingsPage: React.FC<FindingsPageProps> = ({
  initialScanId,
  initialFindingId,
  onNavigateToScan,
}) => {
  const [scans, setScans] = useState<ScanHistoryItem[]>([]);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(initialScanId || null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected finding state for full detail view
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
      const res = await api.getScanFindings(scanId);
      const list = res.completed || [];
      setFindings(list);

      // If initialFindingId was requested, pick it
      if (initialFindingId && list.length > 0) {
        const target = list.find((f) => getFindingId(f) === initialFindingId);
        if (target) {
          setSelectedFinding(target);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load findings";
      setError(msg);
      setFindings([]);
    } finally {
      setLoading(false);
    }
  }, [initialFindingId]);

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
      return;
    }

    let isCancelled = false;
    setLoadingArtifacts(true);

    api
      .getFindingArtifacts(selectedScanId, fid)
      .then((data) => {
        if (!isCancelled) {
          setArtifactsCache((prev) => ({ ...prev, [fid]: data }));
        }
      })
      .catch((err) => {
        console.warn(`Artifact fetch failed for finding ${fid}:`, err);
      })
      .finally(() => {
        if (!isCancelled) {
          setLoadingArtifacts(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedScanId, selectedFinding, artifactsCache]);

  const handleReviewDecision = async (decision: "approved" | "rejected", notes?: string) => {
    if (!selectedScanId || !selectedFinding) return;
    const fid = getFindingId(selectedFinding);
    try {
      await api.submitReviewDecision(selectedScanId, fid, decision, notes);
      setFindings((prev) =>
        prev.map((f) =>
          getFindingId(f) === fid
            ? { ...f, status: decision === "approved" ? "verified_pr_opened" : "patch_generation_failed" }
            : f
        )
      );
      if (selectedFinding) {
        setSelectedFinding((prev) =>
          prev
            ? {
                ...prev,
                status: decision === "approved" ? "verified_pr_opened" : "patch_generation_failed",
              }
            : null
        );
      }
    } catch (err) {
      console.error("Failed to submit review decision:", err);
      throw err;
    }
  };

  const handleMarkResolved = (fid: string) => {
    setFindings((prev) =>
      prev.map((f) => (getFindingId(f) === fid ? { ...f, status: "resolved" } : f))
    );
    if (selectedFinding && getFindingId(selectedFinding) === fid) {
      setSelectedFinding((prev) => (prev ? { ...prev, status: "resolved" } : null));
    }
  };

  const availableFiles = useMemo(() => {
    const set = new Set<string>();
    findings.forEach((f) => {
      if (f.file_path) set.add(f.file_path);
    });
    return Array.from(set).sort();
  }, [findings]);

  const severityCounts = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const f of findings) {
      const sev = getNormalizedSeverity(f.severity);
      counts[sev]++;
    }
    return counts;
  }, [findings]);

  const statusCounts = useMemo(() => {
    const counts = {
      open: 0,
      fixAvailable: 0,
      verified: 0,
      prCreated: 0,
      resolved: 0,
      falsePositive: 0,
    };
    for (const f of findings) {
      const status = getNormalizedFindingStatus(f);
      switch (status) {
        case "open":
          counts.open++;
          break;
        case "fix_available":
          counts.fixAvailable++;
          break;
        case "verified":
          counts.verified++;
          break;
        case "pr_created":
          counts.prCreated++;
          break;
        case "resolved":
          counts.resolved++;
          break;
        case "false_positive":
          counts.falsePositive++;
          break;
      }
    }
    return counts;
  }, [findings]);

  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      // 1. Severity filter
      if (selectedSeverity !== "all") {
        if (getNormalizedSeverity(f.severity) !== selectedSeverity.toLowerCase().trim()) {
          return false;
        }
      }

      // 2. Status filter
      if (selectedStatus !== "all") {
        if (getNormalizedFindingStatus(f) !== selectedStatus.toLowerCase().trim()) {
          return false;
        }
      }

      // 3. Scanner filter
      if (selectedScanner !== "all") {
        const sc = (f.tool_source || "").toLowerCase().trim();
        if (sc !== selectedScanner.toLowerCase().trim()) {
          return false;
        }
      }

      // 4. File filter
      if (selectedFile !== "all") {
        if ((f.file_path || "").trim() !== selectedFile.trim()) {
          return false;
        }
      }

      // 5. Search query filter
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchesCwe = (f.cwe_id || "").toLowerCase().includes(q);
        const matchesMsg = (f.raw_message || "").toLowerCase().includes(q);
        const matchesFile = (f.file_path || "").toLowerCase().includes(q);
        const matchesId = getFindingId(f).toLowerCase().includes(q);
        const matchesDisplayId = (f.display_id || "").toLowerCase().includes(q);
        const matchesTitle = getFindingTitle(f).toLowerCase().includes(q);
        if (!matchesCwe && !matchesMsg && !matchesFile && !matchesId && !matchesDisplayId && !matchesTitle) {
          return false;
        }
      }

      return true;
    });
  }, [findings, selectedSeverity, selectedStatus, selectedScanner, selectedFile, search]);

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

  const handlePrCreated = (prInfo: {
    pr_number: number;
    pr_url: string;
    branch: string;
    base_branch: string;
  }) => {
    if (!selectedFinding) return;
    const fid = getFindingId(selectedFinding);
    setSelectedFinding((prev) =>
      prev
        ? {
            ...prev,
            pr_url: prInfo.pr_url,
            pr_number: prInfo.pr_number,
            branch: prInfo.branch,
            status: "verified_pr_opened",
          }
        : null
    );
    setFindings((prev) =>
      prev.map((f) =>
        getFindingId(f) === fid
          ? {
              ...f,
              pr_url: prInfo.pr_url,
              pr_number: prInfo.pr_number,
              branch: prInfo.branch,
              status: "verified_pr_opened",
            }
          : f
      )
    );
    setArtifactsCache((prev) => ({
      ...prev,
      [fid]: {
        ...(prev[fid] || {}),
        pr: {
          pr_url: prInfo.pr_url,
          pr_number: prInfo.pr_number,
          branch: prInfo.branch,
          base_branch: prInfo.base_branch,
        },
      },
    }));
  };

  const currentScan = scans.find((s) => s.scan_id === selectedScanId);

  const isFiltered =
    selectedSeverity !== "all" ||
    selectedStatus !== "all" ||
    selectedScanner !== "all" ||
    selectedFile !== "all" ||
    search.trim().length > 0;

  // IF A FINDING IS ACTIVELY SELECTED: RENDER DEDICATED FULL-SCREEN WORKSPACE
  if (selectedFinding) {
    return (
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="max-w-7xl mx-auto"
      >
        <FindingDetailWorkspace
          finding={selectedFinding}
          artifacts={currentArtifacts}
          loadingArtifacts={loadingArtifacts}
          scanId={selectedScanId || undefined}
          repoUrl={currentScan?.repo_url}
          scanStatus={currentScan?.status}
          onPrCreated={handlePrCreated}
          onClose={() => setSelectedFinding(null)}
          onReviewDecision={handleReviewDecision}
          onMarkResolved={handleMarkResolved}
        />
      </motion.div>
    );
  }

  // DEFAULT: FULL-WIDTH CLEAN FINDINGS LIST
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6 max-w-7xl mx-auto select-none"
    >
      {/* 1. Header Toolbar */}
      <motion.div
        variants={cardEntrance}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#292D2A]"
      >
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-medium tracking-wider text-[#8CFF8C]">
            <span className="w-2 h-2 rounded-full bg-[#8CFF8C]" />
            <span className="uppercase text-[11px]">SECURITY FINDINGS</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-sans font-bold text-[#F4F5F4] tracking-tight">
            Security Findings
          </h1>
          <p className="text-xs text-[#A5AAA6] font-sans">
            {findings.length} {findings.length === 1 ? "vulnerability" : "vulnerabilities"} discovered across repository code.
          </p>
        </div>

        {/* Scan Run Picker Dropdown */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#151716] border border-[#292D2A] rounded-xl px-3 py-1.5 text-xs font-mono">
            <span className="text-[#666C68] hidden sm:inline">Active Run:</span>
            <select
              value={selectedScanId || ""}
              onChange={(e) => setSelectedScanId(e.target.value)}
              className="bg-transparent text-[#F4F5F4] font-mono text-xs focus:outline-none cursor-pointer max-w-[220px] truncate"
            >
              {scans.length === 0 ? (
                <option value="">No scans available</option>
              ) : (
                scans.map((s) => (
                  <option key={s.scan_id} value={s.scan_id} className="bg-[#151716] text-[#F4F5F4]">
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
              icon={<ExternalLink className="w-3.5 h-3.5 text-[#8CFF8C]" />}
              className="text-xs font-mono hidden md:inline-flex"
            >
              Pipeline
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
          severityCounts={severityCounts}
          statusCounts={statusCounts}
          onReset={handleResetFilters}
        />
      </motion.div>

      {/* 3. Main Finding Technical Table */}
      {error ? (
        <div className="p-6 rounded-2xl bg-[#FF5555]/10 border border-[#FF5555]/30 flex items-start gap-3 text-[#FF5555] text-xs font-mono">
          <AlertCircle className="w-5 h-5 text-[#FF5555] shrink-0 mt-0.5" />
          <div className="space-y-2">
            <div className="font-semibold">Unable to Load Scan Findings</div>
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
      ) : (
        <motion.div variants={cardEntrance}>
          <FindingList
            findings={filteredFindings}
            totalCount={findings.length}
            isFiltered={isFiltered}
            onResetFilters={handleResetFilters}
            selectedFindingId={selectedFinding ? getFindingId(selectedFinding) : null}
            onSelectFinding={setSelectedFinding}
          />
        </motion.div>
      )}
    </motion.div>
  );
};
