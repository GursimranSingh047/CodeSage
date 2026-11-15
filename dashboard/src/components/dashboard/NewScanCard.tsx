import React, { useState, useEffect, useRef } from "react";
import {
  GitBranch,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Terminal,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { api } from "@/api/client";
import { RepositoryValidationResult } from "@/types";
import { clsx } from "clsx";

interface NewScanCardProps {
  onStartScan: (repoUrl: string, branch?: string, scanners?: string[]) => Promise<string | void>;
  isScanning?: boolean;
  className?: string;
}

export type ScanMode = "full" | "incremental";

export const NewScanCard: React.FC<NewScanCardProps> = ({
  onStartScan,
  isScanning = false,
  className,
}) => {
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [scanMode, setScanMode] = useState<ScanMode>("full");
  const [selectedScanners, setSelectedScanners] = useState<string[]>([
    "semgrep",
    "bandit",
    "gitleaks",
  ]);

  // Validation state
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<RepositoryValidationResult | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Validate repository URL against real backend
  const validateRepo = async (url: string, targetBranch?: string) => {
    const cleanUrl = url.trim();
    if (!cleanUrl) {
      setValidationResult(null);
      setValidationError(null);
      setIsValidating(false);
      return;
    }

    setIsValidating(true);
    setValidationError(null);

    try {
      const res = await api.validateRepository(cleanUrl, targetBranch?.trim() || undefined);
      if (res.valid) {
        setValidationResult(res);
        setValidationError(null);
        if (!branch && res.default_branch) {
          setBranch(res.default_branch);
        }
      } else {
        setValidationResult(null);
        setValidationError(res.error || "Repository is invalid or inaccessible.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Validation failed";
      setValidationError(msg);
    } finally {
      setIsValidating(false);
    }
  };

  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    if (repoUrl.trim().length > 3) {
      debounceTimeoutRef.current = setTimeout(() => {
        validateRepo(repoUrl, branch);
      }, 650);
    } else {
      setValidationResult(null);
      setValidationError(null);
      setIsValidating(false);
    }

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [repoUrl, branch]);

  const toggleScanner = (scannerId: string) => {
    setSelectedScanners((prev) =>
      prev.includes(scannerId)
        ? prev.length > 1
          ? prev.filter((s) => s !== scannerId)
          : prev
        : [...prev, scannerId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim() || isScanning || isSubmitting) return;

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      await onStartScan(
        repoUrl.trim(),
        branch.trim() || undefined,
        selectedScanners
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initiate scan";
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={clsx(
        "surface-card rounded-2xl p-6 sm:p-7 space-y-5 relative overflow-hidden",
        className
      )}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#292D2A]">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#666C68] font-bold block">
            Initiate Security Audit
          </span>
          <h3 className="text-base font-sans font-bold text-[#F4F5F4] tracking-tight">
            Target Repository
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full text-[11px] font-mono bg-[#151716] text-[#A5AAA6] border border-[#292D2A]">
            Sandboxed
          </span>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-mono bg-[#16351F] text-[#8CFF8C] border border-[#8CFF8C]/35 font-semibold">
            AI Triage
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Repository Input Field */}
        <div className="space-y-1.5">
          <label className="block text-xs font-mono font-medium tracking-wider text-[#A5AAA6] uppercase">
            Repository URL or Local Path
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#666C68]">
              <Terminal className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/org/repo or local/path"
              disabled={isScanning || isSubmitting}
              className="w-full pl-10 pr-10 py-2.5 bg-[#151716] border border-[#292D2A] rounded-xl text-xs font-mono text-[#F4F5F4] placeholder-[#666C68] focus:outline-none focus:ring-1 focus:ring-[#8CFF8C] focus:border-[#8CFF8C] transition-all"
            />
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
              {isValidating && (
                <Loader2 className="w-4 h-4 text-[#8CFF8C] animate-spin" />
              )}
              {!isValidating && validationResult && (
                <CheckCircle2 className="w-4 h-4 text-[#8CFF8C]" />
              )}
              {!isValidating && validationError && (
                <AlertCircle className="w-4 h-4 text-[#FF5555]" />
              )}
            </div>
          </div>

          {/* Validation Feedback */}
          {validationResult && (
            <div className="text-[11px] font-mono text-[#8CFF8C] flex items-center gap-1.5 pt-0.5">
              <span>✓ Verified repository access</span>
              {validationResult.default_branch && (
                <span className="text-[#A5AAA6]">
                  &bull; default: {validationResult.default_branch}
                </span>
              )}
            </div>
          )}
          {validationError && (
            <p className="text-[11px] font-mono text-[#FF5555] pt-0.5">
              {validationError}
            </p>
          )}
        </div>

        {/* Branch & Scan Type Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="space-y-1.5">
            <label className="block text-xs font-mono font-medium tracking-wider text-[#A5AAA6] uppercase">
              Target Branch (Optional)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#666C68]">
                <GitBranch className="w-3.5 h-3.5" />
              </div>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main or develop"
                disabled={isScanning || isSubmitting}
                className="w-full pl-9 pr-3 py-2 bg-[#151716] border border-[#292D2A] rounded-xl text-xs font-mono text-[#F4F5F4] placeholder-[#666C68] focus:outline-none focus:ring-1 focus:ring-[#8CFF8C] focus:border-[#8CFF8C]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-mono font-medium tracking-wider text-[#A5AAA6] uppercase">
              Scan Mode
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setScanMode("full")}
                className={clsx(
                  "px-3 py-2 rounded-xl text-xs font-mono font-medium border transition-all text-center cursor-pointer",
                  scanMode === "full"
                    ? "bg-[#16351F] text-[#8CFF8C] border-[#8CFF8C]/40"
                    : "bg-[#151716] text-[#A5AAA6] border-[#292D2A] hover:border-[#363C38]"
                )}
              >
                Full Scan
              </button>
              <button
                type="button"
                onClick={() => setScanMode("incremental")}
                className={clsx(
                  "px-3 py-2 rounded-xl text-xs font-mono font-medium border transition-all text-center cursor-pointer flex items-center justify-center gap-1",
                  scanMode === "incremental"
                    ? "bg-[#16351F] text-[#8CFF8C] border-[#8CFF8C]/40"
                    : "bg-[#151716] text-[#A5AAA6] border-[#292D2A] hover:border-[#363C38]"
                )}
              >
                <span>Incremental</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#8CFF8C]" />
              </button>
            </div>
          </div>
        </div>

        {/* Security Scanners Row */}
        <div className="space-y-1.5 pt-1">
          <label className="block text-xs font-mono font-medium tracking-wider text-[#A5AAA6] uppercase">
            Active Security Engines
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: "semgrep", label: "Semgrep (AST)" },
              { id: "bandit", label: "Bandit (Python)" },
              { id: "gitleaks", label: "Gitleaks (Entropy)" },
            ].map((sc) => {
              const active = selectedScanners.includes(sc.id);
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => toggleScanner(sc.id)}
                  disabled={isScanning || isSubmitting}
                  className={clsx(
                    "px-3 py-1.5 rounded-xl text-xs font-mono transition-all border cursor-pointer",
                    active
                      ? "bg-[#16351F] text-[#8CFF8C] border-[#8CFF8C]/40 font-semibold"
                      : "bg-[#151716] text-[#666C68] border-[#292D2A] hover:border-[#363C38]"
                  )}
                >
                  {sc.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error message */}
        {submitError && (
          <div className="p-3 rounded-xl bg-[#FF5555]/10 border border-[#FF5555]/25 text-xs text-[#FF5555] font-mono">
            {submitError}
          </div>
        )}

        {/* Submit Button */}
        <div className="pt-2">
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={isScanning || isSubmitting}
            disabled={!repoUrl.trim()}
            className="w-full font-sans font-semibold text-xs"
            iconRight={<ArrowRight className="w-4 h-4 text-[#080909]" />}
          >
            {isScanning
              ? "Autonomous Pipeline Executing..."
              : isSubmitting
              ? "Initiating Engine..."
              : "Launch Security Scan"}
          </Button>
        </div>
      </form>
    </div>
  );
};
