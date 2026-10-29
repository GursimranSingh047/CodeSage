import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  GitBranch,
  ShieldAlert,
  Key,
  Sliders,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Loader2,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import { validateRepository } from "../api";
import { useScanFlow } from "../design/ScanFlowContext";

const SAMPLE_REPOS = [
  { label: "Flask (Python)", url: "https://github.com/pallets/flask" },
  { label: "Express (Node.js)", url: "https://github.com/expressjs/express" },
  { label: "Gin (Go)", url: "https://github.com/gin-gonic/gin" },
  { label: "Local Demo Target", url: "./test-target-repo" },
];

export default function GitHubRepoScanner() {
  const navigate = useNavigate();
  const { startUrl, startDemo } = useScanFlow();

  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [scanners, setScanners] = useState(["semgrep", "bandit", "gitleaks"]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [validation, setValidation] = useState(null); // { valid, error, owner, repo, default_branch, private }
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clientError, setClientError] = useState(null);

  // Quick client-side format checker
  const checkClientFormat = useCallback((val) => {
    if (!val || !val.trim()) {
      return null;
    }
    const trimmed = val.trim();
    if (trimmed.startsWith("./") || trimmed.startsWith("/")) {
      return null; // Local repo path is valid
    }
    if (trimmed.includes("@") && (trimmed.startsWith("http://") || trimmed.startsWith("https://"))) {
      return "Embedded credentials in repository URLs are rejected for security.";
    }
    if (trimmed.includes("/pull/")) {
      return "Pull request URLs are not supported. Please enter the main repository URL.";
    }
    if (
      !trimmed.startsWith("https://github.com/") &&
      !trimmed.startsWith("http://github.com/") &&
      !trimmed.startsWith("github.com/")
    ) {
      return "Please enter a valid GitHub repository URL (e.g. https://github.com/owner/repo).";
    }
    const clean = trimmed.replace(/^https?:\/\/github\.com\//, "").replace(/^github\.com\//, "");
    const parts = clean.split("/").filter(Boolean);
    if (parts.length < 2) {
      return "URL must include both owner and repository name (e.g. https://github.com/pallets/flask).";
    }
    return null;
  }, []);

  // Trigger pre-flight validation on blur or when a valid URL is entered
  const runValidation = useCallback(
    async (targetUrl, targetBranch, targetToken) => {
      const err = checkClientFormat(targetUrl);
      if (err) {
        setClientError(err);
        setValidation(null);
        return;
      }
      setClientError(null);

      // Skip remote validation for local test repo
      if (targetUrl.startsWith("./") || targetUrl.startsWith("/")) {
        setValidation({
          valid: true,
          owner: "local",
          repo: targetUrl,
          default_branch: "main",
          private: false,
        });
        return;
      }

      setIsValidating(true);
      try {
        const res = await validateRepository(targetUrl, targetBranch || null, targetToken || null);
        setValidation(res);
        if (res.default_branch && !branch) {
          // prefill default branch if found
          setBranch(res.default_branch);
        }
      } catch (e) {
        setValidation({ valid: false, error: e.message });
      } finally {
        setIsValidating(false);
      }
    },
    [checkClientFormat, branch]
  );

  const handleUrlChange = (e) => {
    const val = e.target.value;
    setUrl(val);
    const err = checkClientFormat(val);
    setClientError(err);
    if (!val.trim()) {
      setValidation(null);
    }
  };

  const handleUrlBlur = () => {
    if (url.trim() && !clientError) {
      runValidation(url.trim(), branch.trim(), githubToken.trim());
    }
  };

  const toggleScanner = (scannerId) => {
    setScanners((prev) =>
      prev.includes(scannerId)
        ? prev.length > 1
          ? prev.filter((s) => s !== scannerId)
          : prev // Keep at least one scanner active
        : [...prev, scannerId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setClientError("Please enter a GitHub repository URL or select a sample repo.");
      return;
    }

    const err = checkClientFormat(trimmedUrl);
    if (err) {
      setClientError(err);
      toast.error(err);
      return;
    }

    // If it's the demo repo, user can launch it directly
    if (trimmedUrl === "./test-target-repo") {
      startDemo("./test-target-repo");
      navigate("/pipeline");
      return;
    }

    setIsSubmitting(true);
    try {
      toast.loading("Initiating repository security scan...", { id: "repo-scan" });
      await startUrl(trimmedUrl, {
        branch: branch.trim() || undefined,
        scanners,
        githubToken: githubToken.trim() || undefined,
      });
      toast.success("Security audit pipeline running!", { id: "repo-scan" });
      navigate("/pipeline");
    } catch (err) {
      toast.error(err.message || "Failed to start repository scan", { id: "repo-scan" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectSample = (sample) => {
    setUrl(sample.url);
    setClientError(null);
    setBranch(sample.url === "./test-target-repo" ? "main" : "");
    runValidation(sample.url, "", "");
  };

  return (
    <div className="notch-tr w-full border border-edge bg-surface/95 p-6 shadow-2xl backdrop-blur-md sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge/60 pb-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-mint/15 text-mint border border-mint/20">
            <Search size={20} />
          </span>
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-ink">
              Scan GitHub Repository
            </h2>
            <p className="text-[13px] text-fog">
              Autonomous multi-agent audit for any public or authorized private repository
            </p>
          </div>
        </div>
        <span className="notch-tr inline-flex items-center gap-1.5 border border-mint/30 bg-mint/10 px-3 py-1 text-[11.5px] font-semibold text-mint">
          <Sparkles size={13} /> Live Pipeline
        </span>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        {/* URL Input */}
        <div>
          <label className="mb-2 block text-[13px] font-semibold tracking-wide text-ink">
            Repository URL
          </label>
          <div className="relative">
            <input
              type="text"
              value={url}
              onChange={handleUrlChange}
              onBlur={handleUrlBlur}
              placeholder="https://github.com/owner/repository"
              className={`w-full rounded-lg border bg-void px-4 py-3 font-mono text-[14px] text-ink placeholder:text-dim focus:outline-none focus:ring-2 ${
                clientError
                  ? "border-red-500/60 focus:ring-red-500/30"
                  : validation?.valid
                  ? "border-mint/50 focus:ring-mint/20"
                  : "border-edge focus:ring-mint/20"
              }`}
            />
            {isValidating && (
              <span className="absolute right-3.5 top-3.5 text-fog">
                <Loader2 size={18} className="animate-spin text-mint" />
              </span>
            )}
          </div>

          {/* Validation feedback */}
          {clientError && (
            <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-red-400">
              <AlertCircle size={14} className="shrink-0" /> {clientError}
            </p>
          )}

          {validation && !clientError && (
            <div className="mt-2.5">
              {validation.valid ? (
                <div className="inline-flex items-center gap-2 rounded border border-mint/30 bg-mint/10 px-3 py-1 text-[12px] text-mint">
                  <CheckCircle2 size={13} />
                  <span>
                    Accessible: <strong className="font-mono">{validation.owner}/{validation.repo}</strong>
                    {validation.default_branch && ` (default: ${validation.default_branch})`}
                    {validation.private ? " [Private]" : " [Public]"}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[12.5px] text-amber-400">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{validation.error || "Repository not accessible or private."}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sample repositories pills */}
        <div>
          <span className="text-[12px] font-semibold text-fog">Quick test repositories:</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {SAMPLE_REPOS.map((sample) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => selectSample(sample)}
                className={`notch-tr rounded border px-3 py-1 text-[11.5px] font-medium transition ${
                  url === sample.url
                    ? "border-mint bg-mint/15 text-mint"
                    : "border-edge bg-raised/60 text-fog hover:border-edge-strong hover:text-ink"
                }`}
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scanner toggles */}
        <div>
          <label className="mb-2 block text-[13px] font-semibold tracking-wide text-ink">
            Active Security Scanners
          </label>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {[
              { id: "semgrep", label: "Semgrep", desc: "AST Vulnerability Rules" },
              { id: "bandit", label: "Bandit", desc: "Python SAST Engine" },
              { id: "gitleaks", label: "Gitleaks", desc: "Hardcoded Secrets & Keys" },
            ].map(({ id, label, desc }) => {
              const active = scanners.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleScanner(id)}
                  className={`flex flex-col items-start rounded-lg border p-3 text-left transition ${
                    active
                      ? "border-mint/50 bg-mint/5 text-ink"
                      : "border-edge bg-void/50 text-dim hover:text-fog"
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-[13px] font-bold">{label}</span>
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${active ? "bg-mint" : "bg-dim"}`}
                    />
                  </div>
                  <span className="mt-1 text-[11px] text-fog">{desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Advanced / Authorization options toggle */}
        <div className="border-t border-edge/60 pt-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-2 text-[12.5px] font-semibold text-fog transition hover:text-ink"
          >
            <Sliders size={14} />
            <span>{showAdvanced ? "Hide advanced options" : "Branch & private repository authorization"}</span>
          </button>

          {showAdvanced && (
            <div className="mt-4 grid gap-4 rounded-lg border border-edge bg-void/70 p-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-fog">
                  <GitBranch size={13} /> Target Branch (Optional)
                </label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="e.g. main, dev, v2.0"
                  className="w-full rounded border border-edge bg-surface px-3 py-2 font-mono text-[13px] text-ink placeholder:text-dim focus:border-mint focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-fog">
                  <Key size={13} /> GitHub Token / PAT (Private Repos)
                </label>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full rounded border border-edge bg-surface px-3 py-2 font-mono text-[13px] text-ink placeholder:text-dim focus:border-mint focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting || Boolean(clientError)}
            className="notch-tr flex w-full items-center justify-center gap-2 bg-mint py-3.5 text-[14.5px] font-bold text-black transition hover:bg-[#a5ffd0] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={17} className="animate-spin" />
                <span>Initializing Audit Pipeline...</span>
              </>
            ) : (
              <>
                <span>Analyze Repository</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
