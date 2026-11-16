import React from "react";
import { Search, AlertTriangle, Info, AlertCircle } from "lucide-react";
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
  severityCounts?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  statusCounts?: {
    open: number;
    fixAvailable: number;
    verified: number;
    prCreated: number;
    resolved: number;
    falsePositive: number;
  };
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
  severityCounts = { critical: 0, high: 0, medium: 0, low: 0 },
  statusCounts = { open: 0, fixAvailable: 0, verified: 0, prCreated: 0, resolved: 0, falsePositive: 0 },
  className,
}) => {
  const severityPills = [
    {
      id: "all",
      label: "All Severities",
      count:
        severityCounts.critical +
        severityCounts.high +
        severityCounts.medium +
        severityCounts.low,
      color: "text-[#F4F5F4]",
      activeBorder: "border-[#8CFF8C] bg-[#16351F] text-[#8CFF8C]",
    },
    {
      id: "critical",
      label: "Critical",
      count: severityCounts.critical,
      icon: <AlertTriangle className="w-3.5 h-3.5 text-[#FF5555]" />,
      color: "text-[#FF5555]",
      activeBorder: "border-[#FF5555] bg-[#FF5555]/10 text-[#FF5555]",
    },
    {
      id: "high",
      label: "High",
      count: severityCounts.high,
      icon: <Info className="w-3.5 h-3.5 text-[#FFB84D]" />,
      color: "text-[#FFB84D]",
      activeBorder: "border-[#FFB84D] bg-[#FFB84D]/10 text-[#FFB84D]",
    },
    {
      id: "medium",
      label: "Medium",
      count: severityCounts.medium,
      icon: <AlertCircle className="w-3.5 h-3.5 text-[#A5AAA6]" />,
      color: "text-[#A5AAA6]",
      activeBorder: "border-[#8CFF8C] bg-[#16351F] text-[#8CFF8C]",
    },
    {
      id: "low",
      label: "Low",
      count: severityCounts.low,
      icon: <Info className="w-3.5 h-3.5 text-[#666C68]" />,
      color: "text-[#666C68]",
      activeBorder: "border-[#8CFF8C] bg-[#16351F] text-[#8CFF8C]",
    },
  ];

  const statusPills = [
    { id: "all", label: "All Status", count: null },
    { id: "open", label: "Open", count: statusCounts.open },
    { id: "fix_available", label: "Fix Available", count: statusCounts.fixAvailable },
    { id: "verified", label: "Verified", count: statusCounts.verified },
    { id: "pr_created", label: "PR Created", count: statusCounts.prCreated },
    { id: "resolved", label: "Resolved", count: statusCounts.resolved },
    { id: "false_positive", label: "False Positive", count: statusCounts.falsePositive },
  ];

  const scanners = ["all", "semgrep", "bandit", "gitleaks"];

  return (
    <div className={clsx("space-y-4", className)}>
      {/* 1. Top Severity Pills & Search Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Severity Quick Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {severityPills.map((p) => {
            const isActive = selectedSeverity === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSeverityChange(p.id)}
                className={clsx(
                  "px-3 py-1.5 rounded-xl text-xs font-mono font-medium border transition-all flex items-center gap-1.5 cursor-pointer select-none",
                  isActive
                    ? p.activeBorder
                    : "bg-[#101211] border-[#292D2A] text-[#A5AAA6] hover:border-[#363C38] hover:text-[#F4F5F4]"
                )}
              >
                {p.icon && <span>{p.icon}</span>}
                <span>
                  {p.count !== null && `${p.count} `}
                  {p.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input Bar */}
        <div className="relative w-full md:w-72">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#666C68]">
            <Search className="w-3.5 h-3.5" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search findings, CWE, file, rule..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[#101211] border border-[#292D2A] text-xs font-mono text-[#F4F5F4] placeholder-[#666C68] focus:outline-none focus:border-[#8CFF8C] transition-colors"
          />
        </div>
      </div>

      {/* 2. Secondary Filter Bar: Lifecycle Status & Scanner Tool */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#292D2A]/60">
        {/* Status Lifecycle Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
          <span className="text-[#666C68] mr-1 hidden sm:inline">Status:</span>
          {statusPills.map((s) => {
            const isActive = selectedStatus === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onStatusChange(s.id)}
                className={clsx(
                  "px-2.5 py-1 rounded-lg transition-all cursor-pointer select-none",
                  isActive
                    ? "bg-[#16351F] text-[#8CFF8C] border border-[#8CFF8C]/40 font-semibold"
                    : "bg-[#151716] border border-[#292D2A] text-[#A5AAA6] hover:text-[#F4F5F4]"
                )}
              >
                <span>{s.label}</span>
                {s.count !== null && s.count > 0 && (
                  <span className="ml-1 opacity-70">({s.count})</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Scanner Tool Selector */}
        <div className="flex items-center gap-1.5 text-xs font-mono">
          <span className="text-[#666C68] mr-1 hidden sm:inline">Scanner:</span>
          <div className="flex items-center p-0.5 rounded-lg bg-[#151716] border border-[#292D2A]">
            {scanners.map((tool) => {
              const isActive = selectedScanner === tool;
              return (
                <button
                  key={tool}
                  type="button"
                  onClick={() => onScannerChange(tool)}
                  className={clsx(
                    "px-2.5 py-1 rounded text-[11px] capitalize transition-all cursor-pointer",
                    isActive
                      ? "bg-[#16351F] text-[#8CFF8C] font-semibold"
                      : "text-[#A5AAA6] hover:text-[#F4F5F4]"
                  )}
                >
                  {tool}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
