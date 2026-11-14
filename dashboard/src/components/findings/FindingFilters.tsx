import React from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";
import { clsx } from "clsx";

interface FindingFiltersProps {
  search: string;
  onSearchChange: (val: string) => void;
  selectedSeverity: string;
  onSeverityChange: (val: string) => void;
  selectedScanner: string;
  onScannerChange: (val: string) => void;
  selectedStatus: string;
  onStatusChange: (val: string) => void;
  selectedFile: string;
  onFileChange: (val: string) => void;
  availableFiles: string[];
  totalCount: number;
  filteredCount: number;
  onReset: () => void;
  className?: string;
}

export const FindingFilters: React.FC<FindingFiltersProps> = ({
  search,
  onSearchChange,
  selectedSeverity,
  onSeverityChange,
  selectedScanner,
  onScannerChange,
  selectedStatus,
  onStatusChange,
  selectedFile,
  onFileChange,
  availableFiles,
  totalCount,
  filteredCount,
  onReset,
  className,
}) => {
  const hasActiveFilters =
    search.trim() !== "" ||
    selectedSeverity !== "all" ||
    selectedScanner !== "all" ||
    selectedStatus !== "all" ||
    selectedFile !== "all";

  return (
    <div className={clsx("space-y-3", className)}>
      {/* Search Input Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-sage-400">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by CWE, message, filename, or ID..."
          className="w-full pl-10 pr-9 py-2 bg-sage-900 border border-white/[0.08] rounded-xl text-sage-100 placeholder-sage-500 font-mono text-xs focus:outline-none focus:border-accent-orange/50 focus:ring-1 focus:ring-accent-orange/30 transition-all"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-sage-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Filter Selectors Row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Severity Filter */}
        <select
          value={selectedSeverity}
          onChange={(e) => onSeverityChange(e.target.value)}
          className="bg-sage-900 border border-white/[0.08] text-sage-300 text-xs font-mono rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-accent-orange/50 cursor-pointer"
        >
          <option value="all">Severity: All</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="informational">Info</option>
        </select>

        {/* Scanner Filter */}
        <select
          value={selectedScanner}
          onChange={(e) => onScannerChange(e.target.value)}
          className="bg-sage-900 border border-white/[0.08] text-sage-300 text-xs font-mono rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-accent-orange/50 cursor-pointer"
        >
          <option value="all">Scanner: All</option>
          <option value="semgrep">Semgrep</option>
          <option value="bandit">Bandit</option>
          <option value="gitleaks">Gitleaks</option>
        </select>

        {/* Status Filter */}
        <select
          value={selectedStatus}
          onChange={(e) => onStatusChange(e.target.value)}
          className="bg-sage-900 border border-white/[0.08] text-sage-300 text-xs font-mono rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-accent-orange/50 cursor-pointer"
        >
          <option value="all">Status: All</option>
          <option value="confirmed">Confirmed Vuln</option>
          <option value="false_positive">False Positive</option>
          <option value="verified">Verified Fix</option>
          <option value="needs_human_review">Human Review</option>
          <option value="failed">Failed Triage/Patch</option>
        </select>

        {/* File Filter (extracted from findings) */}
        {availableFiles.length > 0 && (
          <select
            value={selectedFile}
            onChange={(e) => onFileChange(e.target.value)}
            className="bg-sage-900 border border-white/[0.08] text-sage-300 text-xs font-mono rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-accent-orange/50 cursor-pointer max-w-[180px] truncate"
          >
            <option value="all">File: All ({availableFiles.length})</option>
            {availableFiles.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        )}

        {/* Clear Filters CTA */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono text-accent-orange hover:bg-accent-orange/10 border border-accent-orange/30 transition-colors"
          >
            <X className="w-3 h-3" />
            <span>Reset</span>
          </button>
        )}

        {/* Count Indicator */}
        <div className="ml-auto text-xs font-mono text-sage-400 flex items-center gap-1.5">
          <SlidersHorizontal className="w-3 h-3 text-sage-500" />
          <span>
            {filteredCount} / {totalCount} findings
          </span>
        </div>
      </div>
    </div>
  );
};
