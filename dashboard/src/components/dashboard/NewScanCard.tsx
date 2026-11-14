import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Github,
  GitBranch,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Zap,
  Repeat,
  Star,
  FileCode,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/api/client";
import { RepositoryValidationResult } from "@/types";
import { clsx } from "clsx";

interface NewScanCardProps {
  onStartScan: (repoUrl: string, branch?: string, scanners?: string[]) => Promise<string | void>;
  isScanning?: boolean;
}

export type ScanMode = "full" | "incremental";

export const NewScanCard: React.FC<NewScanCardProps> = ({
  onStartScan,
  isScanning = false,
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
        // Pre-fill default branch if empty
        if (!branch && res.default_branch) {
          setBranch(res.default_branch);
        }
      } else {
        setValidationResult(null);
        setValidationError(res.error || "Repository is invalid or inaccessible.");
      }
    } catch (err: unknown) {
      setValidationResult(null);
      const msg = err instanceof Error ? err.message : "Validation failed";
      setValidationError(msg);
    } finally {
      setIsValidating(false);
    }
  };

  // Debounced auto-validation when typing
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    if (!repoUrl.trim()) {
      setValidationResult(null);
      setValidationError(null);
      setIsValidating(false);
      return;
    }

    // If starts with https://github.com/ and has some path, validate after debounce
    if (repoUrl.includes("github.com/")) {
      debounceTimeoutRef.current = setTimeout(() => {
        validateRepo(repoUrl, branch);
      }, 700);
    }

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [repoUrl]);

  const toggleScanner = (scannerId: string) => {
    setSelectedScanners((prev) =>
      prev.includes(scannerId)
        ? prev.filter((s) => s !== scannerId)
        : [...prev, scannerId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const targetUrl = repoUrl.trim();
    if (!targetUrl) {
      setSubmitError("Please enter a repository URL.");
      return;
    }

    if (selectedScanners.length === 0) {
      setSubmitError("Please select at least one security scanner.");
      return;
    }

    try {
      setIsSubmitting(true);
      await onStartScan(targetUrl, branch.trim() || undefined, selectedScanners);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to launch scan";
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card
      variant="elevated"
      glow="orange"
      className="p-5 sm:p-7 relative overflow-hidden transition-all duration-300"
    >
      {/* Background Ambience Accent */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-accent-orange/5 rounded-full blur-3xl pointer-events-none" />

      <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-white/[0.06]">
          <div>
            <h2 className="text-base sm:text-lg font-sans font-semibold text-white tracking-tight flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent-orange" />
              <span>Launch Security Scan</span>
            </h2>
            <p className="text-xs text-sage-400 font-sans mt-0.5">
              Automated static analysis, AST context triage, and patch verification.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="teal" size="xs" dot>
              Sandboxed Pipeline
            </Badge>
            <Badge variant="violet" size="xs">
              AI Triage
            </Badge>
          </div>
        </div>

        {/* Repository URL Input with Live Validation Feedback */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono font-medium uppercase tracking-wider text-sage-300">
              GitHub Repository URL <span className="text-rose-400">*</span>
            </label>
            {isValidating && (
              <span className="text-[11px] font-mono text-accent-orange flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                Validating repository...
              </span>
            )}
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-sage-400">
              <Github className="w-4 h-4" />
            </div>

            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onBlur={() => {
                if (repoUrl.trim() && !validationResult && !isValidating) {
                  validateRepo(repoUrl, branch);
                }
              }}
              placeholder="https://github.com/owner/repository"
              disabled={isScanning || isSubmitting}
              className={clsx(
                "w-full pl-10 pr-10 py-2.5 bg-sage-900 border rounded-xl text-sage-100 placeholder-sage-500 font-mono text-xs sm:text-sm transition-all focus:outline-none focus:ring-1 disabled:opacity-50",
                validationError
                  ? "border-rose-500/50 focus:border-rose-500 focus:ring-rose-500/30"
                  : validationResult?.valid
                  ? "border-emerald-500/50 focus:border-emerald-500 focus:ring-emerald-500/30"
                  : "border-white/[0.1] focus:border-accent-orange/50 focus:ring-accent-orange/30"
              )}
            />

            {/* Validation Icon Indicator */}
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
              {isValidating && <Loader2 className="w-4 h-4 text-accent-orange animate-spin" />}
              {!isValidating && validationResult?.valid && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              )}
              {!isValidating && validationError && (
                <AlertCircle className="w-4 h-4 text-rose-400" />
              )}
            </div>
          </div>

          {/* Validation Feedback Banner */}
          <AnimatePresence mode="wait">
            {validationResult?.valid && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-mono font-medium text-emerald-300">
                    {validationResult.full_name}
                  </span>
                  {validationResult.is_private && (
                    <Badge variant="warning" size="xs">Private</Badge>
                  )}
                </div>

                <div className="flex items-center gap-3 text-[11px] font-mono text-sage-400">
                  {validationResult.language && (
                    <span className="flex items-center gap-1 text-sage-300">
                      <FileCode className="w-3 h-3 text-accent-teal" />
                      {validationResult.language}
                    </span>
                  )}
                  {typeof validationResult.stars === "number" && validationResult.stars > 0 && (
                    <span className="flex items-center gap-1 text-amber-400">
                      <Star className="w-3 h-3 fill-current" />
                      {validationResult.stars.toLocaleString()}
                    </span>
                  )}
                  {validationResult.default_branch && (
                    <span className="flex items-center gap-1 text-sage-300">
                      <GitBranch className="w-3 h-3 text-accent-violet" />
                      {validationResult.default_branch}
                    </span>
                  )}
                </div>
              </motion.div>
            )}

            {validationError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/25 flex items-start gap-2 text-xs text-rose-300"
              >
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="font-sans leading-relaxed">{validationError}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Branch & Scan Mode Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Branch Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono font-medium uppercase tracking-wider text-sage-300 flex items-center justify-between">
              <span>Target Branch</span>
              <span className="text-[10px] text-sage-500 lowercase">(optional)</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-sage-400">
                <GitBranch className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main, master, develop"
                disabled={isScanning || isSubmitting}
                className="w-full pl-9 pr-3 py-2.5 bg-sage-900 border border-white/[0.1] rounded-xl text-sage-100 placeholder-sage-500 font-mono text-xs sm:text-sm focus:outline-none focus:border-accent-orange/50 focus:ring-1 focus:ring-accent-orange/30 transition-all disabled:opacity-50"
              />
            </div>
          </div>

          {/* Scan Mode (Full Scan vs Incremental Scan) */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono font-medium uppercase tracking-wider text-sage-300">
              Scan Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setScanMode("full")}
                disabled={isScanning || isSubmitting}
                className={clsx(
                  "p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between select-none",
                  scanMode === "full"
                    ? "bg-accent-orange/15 border-accent-orange/40 text-white shadow-[0_0_12px_rgba(249,115,22,0.15)]"
                    : "bg-sage-900/80 border-white/[0.08] text-sage-400 hover:border-white/[0.16]"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-sans font-semibold">Full Scan</span>
                  <Zap className={clsx("w-3.5 h-3.5", scanMode === "full" ? "text-accent-orange" : "text-sage-500")} />
                </div>
                <span className="text-[10px] font-mono text-sage-400 mt-1 leading-tight">
                  Comprehensive audit
                </span>
              </button>

              <button
                type="button"
                onClick={() => setScanMode("incremental")}
                disabled={isScanning || isSubmitting}
                className={clsx(
                  "p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between select-none",
                  scanMode === "incremental"
                    ? "bg-accent-teal/15 border-accent-teal/40 text-white shadow-[0_0_12px_rgba(20,184,166,0.15)]"
                    : "bg-sage-900/80 border-white/[0.08] text-sage-400 hover:border-white/[0.16]"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-sans font-semibold">Incremental</span>
                  <Repeat className={clsx("w-3.5 h-3.5", scanMode === "incremental" ? "text-accent-teal" : "text-sage-500")} />
                </div>
                <span className="text-[10px] font-mono text-sage-400 mt-1 leading-tight">
                  SHA-256 diff delta
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Active Scanners Chips */}
        <div className="space-y-2">
          <label className="text-xs font-mono font-medium uppercase tracking-wider text-sage-300">
            Security Scanners
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {[
              {
                id: "semgrep",
                name: "Semgrep",
                desc: "Semantic AST rules",
                badge: "AST",
              },
              {
                id: "bandit",
                name: "Bandit",
                desc: "Python security linter",
                badge: "Python",
              },
              {
                id: "gitleaks",
                name: "Gitleaks",
                desc: "Secrets & token detection",
                badge: "Entropy",
              },
            ].map((scanner) => {
              const active = selectedScanners.includes(scanner.id);
              return (
                <button
                  key={scanner.id}
                  type="button"
                  onClick={() => toggleScanner(scanner.id)}
                  disabled={isScanning || isSubmitting}
                  className={clsx(
                    "px-3 py-2 rounded-xl text-xs font-mono border transition-all flex items-center gap-2 select-none",
                    active
                      ? "bg-sage-850 border-accent-orange/40 text-sage-100 shadow-[0_0_10px_rgba(249,115,22,0.1)]"
                      : "bg-sage-900 border-white/[0.06] text-sage-500 hover:border-white/[0.12]"
                  )}
                >
                  <div
                    className={clsx(
                      "w-2 h-2 rounded-full transition-colors",
                      active ? "bg-accent-orange shadow-[0_0_6px_rgba(249,115,22,0.8)]" : "bg-sage-600"
                    )}
                  />
                  <span className="font-semibold text-white">{scanner.name}</span>
                  <span className="text-[10px] text-sage-400 hidden sm:inline">({scanner.badge})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Submit Error Alert */}
        {submitError && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-start gap-2.5 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-rose-200">Unable to Initiate Scan</div>
              <div>{submitError}</div>
            </div>
          </div>
        )}

        {/* Primary Action Button */}
        <div className="pt-2">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={isScanning || isSubmitting}
            disabled={!repoUrl.trim() || selectedScanners.length === 0}
            className="w-full justify-center group font-sans text-sm font-semibold tracking-wide py-3"
            icon={
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            }
          >
            {isSubmitting || isScanning ? "Initializing Scan Pipeline..." : "Scan Repository →"}
          </Button>
        </div>
      </form>
    </Card>
  );
};
