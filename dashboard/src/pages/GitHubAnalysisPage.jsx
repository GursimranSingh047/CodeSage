import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  GitBranch,
  Search,
  ArrowRight,
  Shield,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileText,
  Wrench,
  GitPullRequest,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FileCode,
  Download,
  Share2,
  MoreHorizontal,
  Clock,
  Calendar,
  Layers,
  Code2,
  Key,
  Lock,
  Info,
  Check,
  Plus,
  Compass,
  Terminal,
  RefreshCw,
  Sliders,
  Flame,
} from "lucide-react";
import toast from "react-hot-toast";
import { useScanFlow } from "../design/ScanFlowContext";
import { validateRepository, fetchScanReport } from "../api";

function GithubIcon({ size = 18, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

// Sample / Default Repository state for initial load or sample selection
const DEFAULT_REPO = {
  owner: "pallets",
  repo: "flask",
  full_name: "pallets/flask",
  url: "https://github.com/pallets/flask",
  description: "A simple framework for building complex web applications.",
  default_branch: "main",
  stars: "67.5k",
  forks: "18.2k",
  watchers: "2.1k",
  private: false,
  tags: ["Python", "Web Framework", "MIT License", "13.3k releases"],
};

const PROGRESS_STEPS = [
  { id: "validate", label: "Validating Repository", step: 1 },
  { id: "ingestion", label: "Fetching Contents", step: 2 },
  { id: "tech", label: "Detecting Technologies", step: 3 },
  { id: "scanning", label: "Running Scanners", step: 4 },
  { id: "triage", label: "AI Analysis", step: 5 },
  { id: "patch", label: "Generating Report", step: 6 },
  { id: "completed", label: "Completed", step: 7 },
];

export default function GitHubAnalysisPage() {
  const navigate = useNavigate();
  const { run, isDemo, startUrl, startDemo, flowPhase, scanId } = useScanFlow();

  // Inputs
  const [inputUrl, setInputUrl] = useState(run?.repo?.includes("/") ? `https://github.com/${run.repo}` : "https://github.com/pallets/flask");
  const [selectedBranch, setSelectedBranch] = useState(run?.branch || "main");
  const [githubToken, setGithubToken] = useState("");
  const [showAuthDrawer, setShowAuthDrawer] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // File tree state
  const [fileSearch, setFileSearch] = useState("");
  const [expandedFolders, setExpandedFolders] = useState({ flask: true, src: true, "src/flask": true });
  const [selectedFile, setSelectedFile] = useState("app.py");

  // Validation state
  const [isValidating, setIsValidating] = useState(false);
  const [repoMetadata, setRepoMetadata] = useState(DEFAULT_REPO);

  // Sync with live scan state if active
  useEffect(() => {
    if (run?.repositoryMetadata) {
      const meta = run.repositoryMetadata;
      setRepoMetadata({
        owner: meta.owner || "pallets",
        repo: meta.repo || "flask",
        full_name: meta.full_name || `${meta.owner || "pallets"}/${meta.repo || "flask"}`,
        url: meta.html_url || `https://github.com/${meta.owner || "pallets"}/${meta.repo || "flask"}`,
        description: meta.description || "Repository audited by CodeSage.",
        default_branch: meta.default_branch || run.branch || "main",
        stars: meta.stars ? `${(meta.stars / 1000).toFixed(1)}k` : "67.5k",
        forks: meta.forks ? `${(meta.forks / 1000).toFixed(1)}k` : "18.2k",
        watchers: "2.1k",
        private: Boolean(meta.private),
        tags: [
          run.technologies?.primary_language || "Python",
          ...(run.technologies?.frameworks || ["Web Framework"]),
          "MIT License",
        ],
      });
    }
  }, [run?.repositoryMetadata, run?.technologies, run?.branch]);

  // Stepper calculations
  const currentStepIndex = useMemo(() => {
    if (flowPhase === "completed") return 6;
    if (run.agents?.verify?.status === "working" || run.agents?.patch?.status === "working") return 5;
    if (run.agents?.triage?.status === "working") return 4;
    if (run.agents?.scanning?.status === "working") return 3;
    if (run.agents?.context?.status === "working") return 2;
    if (run.agents?.ingestion?.status === "working") return 1;
    return 3; // default active step running scanners
  }, [flowPhase, run.agents]);

  const progressPercent = useMemo(() => {
    if (flowPhase === "completed") return 100;
    return Math.round(((currentStepIndex + 1) / 7) * 100);
  }, [flowPhase, currentStepIndex]);

  const toggleFolder = (folderKey) => {
    setExpandedFolders((prev) => ({ ...prev, [folderKey]: !prev[folderKey] }));
  };

  // Pre-flight check & scan initiation
  const handleAnalyze = async (e) => {
    e?.preventDefault();
    const clean = inputUrl.trim();
    if (!clean) {
      toast.error("Please enter a GitHub repository URL");
      return;
    }

    setIsValidating(true);
    try {
      if (!clean.startsWith("./") && !clean.startsWith("/")) {
        const val = await validateRepository(clean, selectedBranch, githubToken);
        if (!val.valid) {
          toast.error(val.error || "Repository is inaccessible or private.");
          setIsValidating(false);
          return;
        }
        if (val.default_branch && !selectedBranch) {
          setSelectedBranch(val.default_branch);
        }
      }

      toast.loading("Initiating CodeSage audit...", { id: "audit" });
      await startUrl(clean, {
        branch: selectedBranch || undefined,
        githubToken: githubToken || undefined,
        scanners: ["semgrep", "bandit", "gitleaks"],
      });
      toast.success("Security & engineering audit started!", { id: "audit" });
    } catch (err) {
      toast.error(err.message || "Failed to start audit", { id: "audit" });
    } finally {
      setIsValidating(false);
    }
  };

  const handleDownloadReport = async () => {
    try {
      if (scanId) {
        toast.loading("Generating report...", { id: "rep" });
        const text = await fetchScanReport(scanId);
        toast.dismiss("rep");
        const blob = new Blob([text], { type: "text/markdown" });
        const dlUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = dlUrl;
        a.download = `codesage_audit_${repoMetadata.repo}.md`;
        a.click();
        URL.revokeObjectURL(dlUrl);
        toast.success("Report downloaded");
        return;
      }
    } catch {
      // client fallback
    }

    const clientMd = `# CodeSage Engineering Audit — ${repoMetadata.full_name}\n\nBranch: ${selectedBranch}\nGenerated: ${new Date().toISOString()}\n\nAudit Completed with verified recommendations.`;
    const blob = new Blob([clientMd], { type: "text/markdown" });
    const dlUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = `codesage_audit_${repoMetadata.repo}.md`;
    a.click();
    URL.revokeObjectURL(dlUrl);
    toast.success("Report downloaded");
  };

  // Severity counts
  const counts = {
    critical: run.counts?.critical ?? 2,
    high: run.counts?.high ?? 5,
    medium: run.counts?.medium ?? 8,
    low: run.counts?.low ?? 6,
    info: run.counts?.informational ?? run.counts?.info ?? 3,
  };
  const totalFindings = counts.critical + counts.high + counts.medium + counts.low + counts.info;

  return (
    <div className="space-y-6 pb-16 font-sans">
      {/* 1. Header Section */}
      <section className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl space-y-2">
          <p className="text-[11.5px] font-semibold tracking-wider uppercase text-[#8A857E]">
            GitHub Repository Analysis
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl font-normal tracking-tight text-[#171717] leading-[1.12]">
            Analyze <span className="font-serif-italic text-[#B88746]">any</span> GitHub Repository
          </h1>
          <p className="text-[14.5px] leading-relaxed text-[#6E6B65]">
            Get a comprehensive engineering audit with security analysis, code quality insights, and
            AI-powered recommendations.
          </p>
        </div>

        {/* Right Hero Decorative Feature Isometric Vignette (Matches Reference) */}
        <div className="relative hidden lg:flex items-center gap-6 py-2">
          <div className="flex flex-col gap-2.5 text-[12px] font-medium text-[#5C5852]">
            <span className="flex items-center gap-2"><Shield size={14} className="text-[#8A857E]" /> Security Analysis</span>
            <span className="flex items-center gap-2"><Code2 size={14} className="text-[#8A857E]" /> Code Quality</span>
            <span className="flex items-center gap-2"><Sparkles size={14} className="text-[#8A857E]" /> AI Insights</span>
          </div>

          {/* Isometric 3D Layered Platform */}
          <div className="relative flex items-center justify-center p-2">
            <div className="relative h-24 w-28 rounded-2xl bg-gradient-to-b from-[#FFFFFF] via-[#F4EFE6] to-[#E6DFD3] p-0.5 shadow-xl border border-[#D8D1C4]/80 transform rotate-[-4deg] hover:rotate-0 transition-transform duration-500">
              <div className="flex h-full w-full flex-col items-center justify-center rounded-[14px] bg-gradient-to-b from-[#FFFFFF] to-[#FAF8F5] shadow-inner">
                <GithubIcon size={34} className="text-[#171717] drop-shadow-sm" />
              </div>
              {/* Beveled 3D lower lip */}
              <div className="absolute -bottom-2 inset-x-2 h-2 rounded-b-xl bg-[#C8BFA] opacity-50 blur-[0.5px]" />
            </div>
            {/* Ambient warm glow shadow */}
            <div className="pointer-events-none absolute -bottom-3 h-6 w-32 rounded-full bg-[#B88746]/15 blur-md" />
          </div>

          <div className="flex flex-col gap-2.5 text-[12px] font-medium text-[#5C5852]">
            <span className="flex items-center gap-2"><ShieldAlert size={14} className="text-[#8A857E]" /> Vulnerability Scan</span>
            <span className="flex items-center gap-2"><Layers size={14} className="text-[#8A857E]" /> Dependency Check</span>
            <span className="flex items-center gap-2"><CheckCircle2 size={14} className="text-[#8A857E]" /> Smart Recommendations</span>
          </div>
        </div>
      </section>

      {/* 2. Repository Input Bar */}
      <section className="rounded-2xl border border-[#EBE7DF] bg-white p-3 shadow-xs">
        <form onSubmit={handleAnalyze} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* URL Input */}
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[#171717]">
              <GithubIcon size={18} />
            </span>
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="https://github.com/pallets/flask"
              className="w-full rounded-xl border border-transparent bg-transparent py-2.5 pl-10 pr-4 font-mono text-[13.5px] text-[#171717] placeholder:text-[#96918A] focus:border-[#EBE7DF] focus:bg-[#FAF9F6] focus:outline-none transition-all"
            />
          </div>

          {/* Branch Dropdown */}
          <div className="relative w-full sm:w-44">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[#73706A]">
              <GitBranch size={15} />
            </span>
            <input
              type="text"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              placeholder="main"
              className="w-full rounded-xl border border-[#EBE7DF] bg-[#FAF9F6] py-2.5 pl-9 pr-7 font-mono text-[13px] text-[#171717] focus:border-[#DBD5CA] focus:bg-white focus:outline-none transition-all"
            />
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[#96918A]">
              <ChevronDown size={14} />
            </span>
          </div>

          {/* Analyze Button */}
          <button
            type="submit"
            disabled={isValidating}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#171717] px-6 py-2.5 text-[14px] font-semibold text-white shadow-xs transition hover:bg-black disabled:opacity-50"
          >
            <span>{isValidating ? "Validating..." : "Analyze Repository"}</span>
            <ArrowRight size={15} />
          </button>
        </form>

        {/* Badges & Authorization Notice */}
        <div className="mt-3 flex flex-wrap items-center justify-between border-t border-[#F2EEE7] pt-2.5 px-2 text-[12px] text-[#6E6B65]">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5 font-medium text-[#10B981]">
              <span className="h-2 w-2 rounded-full bg-[#10B981]" />
              Supports public repositories
            </span>
            <button
              type="button"
              onClick={() => setShowAuthDrawer(!showAuthDrawer)}
              className="inline-flex items-center gap-1.5 font-medium text-[#6E6B65] hover:text-[#171717] transition"
            >
              <Lock size={12} />
              Private repositories require authorization
            </button>
          </div>
          <button
            type="button"
            onClick={() => toast("CodeSage shallow-clones the repo, runs SAST & secrets analysis, and triages findings with AI.", { icon: "ℹ️" })}
            className="inline-flex items-center gap-1 text-[#4B6B94] hover:underline"
          >
            <Info size={12} />
            How it works?
          </button>
        </div>

        {/* Private Repo Token Drawer */}
        {showAuthDrawer && (
          <div className="mt-3 rounded-xl border border-[#EBE7DF] bg-[#FAF9F6] p-4 text-[13px]">
            <label className="block font-semibold text-[#171717] mb-1">
              GitHub Personal Access Token (PAT)
            </label>
            <p className="text-[12px] text-[#73706A] mb-2">
              Required only for private repositories. CodeSage passes the token securely over HTTPS headers and never logs credentials.
            </p>
            <input
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full rounded-lg border border-[#EBE7DF] bg-white px-3 py-2 font-mono text-[13px] focus:outline-none focus:border-[#B88746]"
            />
          </div>
        )}
      </section>

      {/* 3. Repository Overview Card (pallets / flask) */}
      <section className="rounded-2xl border border-[#EBE7DF] bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          {/* Left identity */}
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#171717] text-white shadow-xs">
              <GithubIcon size={26} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-xl font-bold tracking-tight text-[#171717]">
                  {repoMetadata.owner} <span className="font-normal text-[#8A857E]">/</span> {repoMetadata.repo}
                </h2>
                <span className="rounded-full bg-[#E8F0FE] px-2.5 py-0.5 text-[11px] font-semibold text-[#1A73E8]">
                  {repoMetadata.private ? "Private" : "Public"}
                </span>
              </div>
              <p className="mt-1 text-[13.5px] text-[#6E6B65]">
                {repoMetadata.description}
              </p>
              {/* Tag Pills matching reference */}
              <div className="mt-3 flex flex-wrap gap-2 text-[11.5px]">
                <span className="inline-flex items-center gap-1 rounded-md border border-[#EBE7DF] bg-[#FAF9F6] px-2.5 py-1 font-medium text-[#5C5852]">
                  <Plus size={11} className="text-[#8A857E]" /> Python
                </span>
                <span className="inline-flex items-center rounded-md border border-[#EBE7DF] bg-[#FAF9F6] px-2.5 py-1 font-medium text-[#5C5852]">
                  Web Framework
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-[#EBE7DF] bg-[#FAF9F6] px-2.5 py-1 font-medium text-[#5C5852]">
                  <Plus size={11} className="text-[#8A857E]" /> MIT License
                </span>
                <span className="inline-flex items-center rounded-md border border-[#EBE7DF] bg-[#FAF9F6] px-2.5 py-1 font-medium text-[#5C5852]">
                  13.3k releases
                </span>
              </div>
            </div>
          </div>

          {/* Right Stats & Action */}
          <div className="flex flex-wrap items-center gap-6 border-t border-[#F2EEE7] pt-4 lg:border-t-0 lg:pt-0">
            <div className="flex items-center gap-6 text-[13px]">
              <div>
                <p className="font-bold text-[#171717]">★ {repoMetadata.stars}</p>
                <p className="text-[11px] text-[#8A857E]">Stars</p>
              </div>
              <div>
                <p className="font-bold text-[#171717]">⑂ {repoMetadata.forks}</p>
                <p className="text-[11px] text-[#8A857E]">Forks</p>
              </div>
              <div>
                <p className="font-bold text-[#171717]">👁 {repoMetadata.watchers}</p>
                <p className="text-[11px] text-[#8A857E]">Watchers</p>
              </div>
              <div>
                <p className="font-bold text-[#171717] font-mono">⑂ {repoMetadata.default_branch}</p>
                <p className="text-[11px] text-[#8A857E]">Default Branch</p>
              </div>
            </div>

            <a
              href={repoMetadata.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#EBE7DF] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#171717] shadow-xs transition hover:bg-[#FAF9F6]"
            >
              <span>View on GitHub</span>
              <ExternalLink size={13} />
            </a>
          </div>
        </div>
      </section>

      {/* 4. Analysis in Progress Horizontal Stepper Card */}
      <section className="rounded-2xl border border-[#EBE7DF] bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-[#F2EEE7]">
          <div>
            <h3 className="text-lg font-bold text-[#171717]">Analysis in Progress</h3>
            <p className="text-[13px] text-[#73706A]">
              Scanning repository, this may take a few minutes...
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              {/* Radial percentage (45% in reference) */}
              <div className="relative grid h-10 w-10 place-items-center">
                <svg className="h-10 w-10 -rotate-90 transform">
                  <circle cx="20" cy="20" r="16" stroke="#EBE7DF" strokeWidth="3" fill="transparent" />
                  <circle
                    cx="20"
                    cy="20"
                    r="16"
                    stroke="#B88746"
                    strokeWidth="3.5"
                    strokeDasharray={100}
                    strokeDashoffset={100 - 45}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                </svg>
                <span className="absolute font-bold text-[11px] text-[#171717]">
                  45%
                </span>
              </div>
              <span className="text-[12px] text-[#8A857E]">
                Estimated time: 2-3 minutes
              </span>
            </div>

            <button
              type="button"
              onClick={() => toast("Audit pipeline paused", { icon: "⏸" })}
              className="flex items-center gap-1.5 rounded-xl border border-[#FEE2E2] bg-[#FEF2F2] px-3.5 py-1.5 text-[12.5px] font-semibold text-[#DC2626] transition hover:bg-[#FEE2E2]"
            >
              <span className="h-2.5 w-2.5 rounded-[2px] bg-[#DC2626]" />
              <span>Cancel Scan</span>
            </button>
          </div>
        </div>

        {/* Stepper Timeline */}
        <div className="pt-6 overflow-x-auto">
          <div className="min-w-[700px] flex items-center justify-between relative px-6">
            {/* Timeline connector bar */}
            <div className="absolute top-4 left-10 right-10 h-0.5 bg-[#EBE7DF] -z-0" />
            <div
              className="absolute top-4 left-10 h-0.5 bg-[#B88746] transition-all duration-500 -z-0"
              style={{ width: "48%" }}
            />

            {PROGRESS_STEPS.map((step, idx) => {
              const isPast = idx < 3;
              const isCurrent = idx === 3; // Running Scanners active in reference
              return (
                <div key={step.id} className="relative z-10 flex flex-col items-center text-center">
                  <div
                    className={`grid h-8 w-8 place-items-center rounded-full border-2 text-[12px] font-bold transition-all ${
                      isPast
                        ? "border-[#B88746] bg-[#B88746] text-white shadow-xs"
                        : isCurrent
                        ? "border-[#B88746] bg-white text-[#B88746] shadow-md ring-4 ring-[#B88746]/15"
                        : "border-[#EBE7DF] bg-[#FAF9F6] text-[#A6A29C]"
                    }`}
                  >
                    {isPast ? (
                      <Check size={14} strokeWidth={3} />
                    ) : isCurrent ? (
                      <Search size={14} strokeWidth={2.5} className="text-[#B88746]" />
                    ) : (
                      step.step
                    )}
                  </div>
                  <span
                    className={`mt-2 max-w-[95px] text-[11.5px] font-medium leading-tight ${
                      isCurrent
                        ? "font-bold text-[#171717]"
                        : isPast
                        ? "text-[#5C5852]"
                        : "text-[#A6A29C]"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5. Section Tabs */}
      <section className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EBE7DF] pb-1">
        <nav className="flex flex-wrap items-center gap-1" aria-label="Analysis tabs">
          {[
            { id: "overview", label: "Overview", icon: Compass },
            { id: "findings", label: "Findings", count: 24, icon: ShieldAlert },
            { id: "files", label: "File Explorer", icon: FileText },
            { id: "dependencies", label: "Dependencies", icon: Layers },
            { id: "insights", label: "AI Insights", icon: Sparkles },
            { id: "fixes", label: "Fix Suggestions", count: 6, icon: Wrench },
            { id: "logs", label: "Scan Logs", icon: Terminal },
          ].map((tab) => {
            const active = activeTab === tab.id;
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium transition-all ${
                  active
                    ? "font-semibold text-[#171717]"
                    : "text-[#6E6B65] hover:text-[#171717]"
                }`}
              >
                <TabIcon size={14} className={active ? "text-[#B88746]" : "text-[#8A857E]"} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                      tab.id === "findings"
                        ? "bg-[#FEE2E2] text-[#DC2626]"
                        : "bg-[#F3E8FF] text-[#7E22CE]"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
                {active && (
                  <span className="absolute bottom-0 inset-x-2 h-[2px] bg-[#171717] rounded-full" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Tab Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadReport}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#EBE7DF] bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-[#171717] shadow-xs transition hover:bg-[#FAF9F6]"
          >
            <Download size={13} />
            Export Report
          </button>
          <button
            type="button"
            onClick={() => toast.success("Share link copied to clipboard")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#EBE7DF] bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-[#5C5852] shadow-xs transition hover:bg-[#FAF9F6]"
          >
            <Share2 size={13} />
            Share
          </button>
          <button
            type="button"
            aria-label="More options"
            className="grid h-8 w-8 place-items-center rounded-xl border border-[#EBE7DF] bg-white text-[#73706A] hover:bg-[#FAF9F6] transition"
          >
            <MoreHorizontal size={15} />
          </button>
        </div>
      </section>

      {/* 6. Three-Column Main Dashboard Grid */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* COLUMN 1: Repository Structure (File Explorer) */}
        <div className="lg:col-span-3 rounded-2xl border border-[#EBE7DF] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3">
            <h3 className="font-bold text-[14px] text-[#171717]">Repository Structure</h3>
            <ChevronDown size={15} className="text-[#8A857E]" />
          </div>

          {/* Search files */}
          <div className="relative my-2">
            <Search size={14} className="absolute left-3 top-2.5 text-[#96918A]" />
            <input
              type="text"
              value={fileSearch}
              onChange={(e) => setFileSearch(e.target.value)}
              placeholder="Search files..."
              className="w-full rounded-lg border border-[#EBE7DF] bg-[#FAF9F6] py-1.5 pl-8 pr-3 text-[12px] text-[#171717] placeholder:text-[#96918A] focus:outline-none focus:border-[#DBD5CA]"
            />
          </div>

          {/* Clean Tree View Without Box Borders */}
          <div className="mt-3 space-y-0.5 font-mono text-[12px] text-[#423E3A]">
            {/* Root folder: flask/ */}
            <div>
              <button
                type="button"
                onClick={() => toggleFolder("flask")}
                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-[#FAF9F6] text-left"
              >
                {expandedFolders.flask ? <ChevronDown size={12} className="text-[#8A857E]" /> : <ChevronRight size={12} className="text-[#8A857E]" />}
                <FolderOpen size={13} className="text-[#B88746]" />
                <span className="font-semibold text-[#171717]">flask/</span>
              </button>

              {expandedFolders.flask && (
                <div className="pl-3.5 space-y-0.5 border-l border-[#F0ECE4] ml-2 mt-0.5">
                  <div className="flex items-center gap-1.5 px-1.5 py-1 text-[#6E6B65] hover:bg-[#FAF9F6] rounded cursor-pointer">
                    <ChevronRight size={12} className="text-[#8A857E]" />
                    <Folder size={13} className="text-[#8A857E]" />
                    <span>docs/</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-1.5 py-1 text-[#6E6B65] hover:bg-[#FAF9F6] rounded cursor-pointer">
                    <ChevronRight size={12} className="text-[#8A857E]" />
                    <Folder size={13} className="text-[#8A857E]" />
                    <span>examples/</span>
                  </div>

                  {/* src/ folder */}
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleFolder("src")}
                      className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-[#FAF9F6] text-left"
                    >
                      {expandedFolders.src ? <ChevronDown size={12} className="text-[#8A857E]" /> : <ChevronRight size={12} className="text-[#8A857E]" />}
                      <FolderOpen size={13} className="text-[#B88746]" />
                      <span>src/</span>
                    </button>

                    {expandedFolders.src && (
                      <div className="pl-3.5 space-y-0.5 border-l border-[#F0ECE4] ml-2">
                        {/* Selected src/flask folder matching reference */}
                        <div className="rounded-md bg-[#EFECE6] px-2 py-1 text-[#171717]">
                          <div className="flex items-center gap-1.5 font-medium">
                            <ChevronDown size={12} className="text-[#171717]" />
                            <FolderOpen size={13} className="text-[#B88746]" />
                            <span>flask/</span>
                          </div>
                        </div>

                        {/* Files inside src/flask */}
                        <div className="pl-4 space-y-0.5 pt-0.5">
                          {["__init__.py", "app.py", "config.py", "helpers.py"].map((f) => (
                            <button
                              key={f}
                              type="button"
                              onClick={() => setSelectedFile(f)}
                              className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left ${
                                selectedFile === f
                                  ? "bg-[#E6E1D6] font-semibold text-[#171717]"
                                  : "text-[#5C5852] hover:bg-[#FAF9F6]"
                              }`}
                            >
                              <FileCode size={12} className="text-[#8A857E]" />
                              <span>{f}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 px-1.5 py-1 text-[#6E6B65] hover:bg-[#FAF9F6] rounded cursor-pointer">
                    <ChevronRight size={12} className="text-[#8A857E]" />
                    <Folder size={13} className="text-[#8A857E]" />
                    <span>tests/</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-1.5 py-1 text-[#6E6B65] hover:bg-[#FAF9F6] rounded cursor-pointer">
                    <ChevronRight size={12} className="text-[#8A857E]" />
                    <Folder size={13} className="text-[#8A857E]" />
                    <span>scripts/</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-1.5 py-1 text-[#5C5852] hover:bg-[#FAF9F6] rounded cursor-pointer">
                    <FileText size={12} className="text-[#8A857E]" />
                    <span>pyproject.toml</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-1.5 py-1 text-[#5C5852] hover:bg-[#FAF9F6] rounded cursor-pointer">
                    <FileText size={12} className="text-[#8A857E]" />
                    <span>README.md</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-1.5 py-1 text-[#5C5852] hover:bg-[#FAF9F6] rounded cursor-pointer">
                    <FileText size={12} className="text-[#8A857E]" />
                    <span>LICENSE</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* COLUMN 2: Scan Summary & Insights (6 columns on lg) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-2xl border border-[#EBE7DF] bg-white p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-[15px] text-[#171717]">Scan Summary</h3>
                <span className="rounded-full border border-[#A7F3D0] bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-semibold text-[#059669]">
                  Completed
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11.5px] text-[#8A857E]">
                <span className="flex items-center gap-1">
                  <Calendar size={12} /> Oct 27, 2026, 3:24 PM
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={12} /> 2m 14s
                </span>
              </div>
            </div>

            {/* Severity Pill Counts Grid */}
            <div className="grid grid-cols-5 gap-2">
              <div className="flex flex-col items-center rounded-xl bg-[#FEF2F2] p-2.5 text-center">
                <span className="text-xl font-bold text-[#DC2626]">2</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#DC2626] mt-0.5">Critical</span>
              </div>
              <div className="flex flex-col items-center rounded-xl bg-[#FFF7ED] p-2.5 text-center">
                <span className="text-xl font-bold text-[#EA580C]">5</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#EA580C] mt-0.5">High</span>
              </div>
              <div className="flex flex-col items-center rounded-xl bg-[#FFFBEB] p-2.5 text-center">
                <span className="text-xl font-bold text-[#D97706]">8</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#D97706] mt-0.5">Medium</span>
              </div>
              <div className="flex flex-col items-center rounded-xl bg-[#EFF6FF] p-2.5 text-center">
                <span className="text-xl font-bold text-[#2563EB]">6</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#2563EB] mt-0.5">Low</span>
              </div>
              <div className="flex flex-col items-center rounded-xl bg-[#F9FAFB] p-2.5 text-center">
                <span className="text-xl font-bold text-[#4B5563]">3</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#4B5563] mt-0.5">Info</span>
              </div>
            </div>

            {/* Detected Technologies */}
            <div className="pt-2">
              <h4 className="text-[12.5px] font-bold text-[#171717] mb-2.5">
                Detected Technologies
              </h4>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { name: "Python", pct: "78%", icon: "🐍" },
                  { name: "Jinja2", pct: "12%", icon: "⚡" },
                  { name: "HTML", pct: "5%", icon: "🌐" },
                  { name: "CSS", pct: "3%", icon: "🎨" },
                  { name: "JavaScript", pct: "2%", icon: "📜" },
                ].map((tech) => (
                  <div
                    key={tech.name}
                    className="flex flex-col items-center rounded-xl border border-[#EBE7DF] bg-[#FAF9F6] p-2 text-center"
                  >
                    <span className="text-base">{tech.icon}</span>
                    <span className="mt-1 text-[11px] font-semibold text-[#171717]">{tech.name}</span>
                    <span className="text-[10px] text-[#8A857E]">{tech.pct}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Key Insights & Quick Actions Side-by-Side (Matches Reference Layout) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-3 border-t border-[#F2EEE7]">
              {/* Left Key Insights (~60%) */}
              <div className="md:col-span-7">
                <h4 className="text-[12.5px] font-bold text-[#171717] mb-2">Key Insights</h4>
                <ul className="space-y-2 text-[11.5px] text-[#5C5852]">
                  <li className="flex items-start gap-2">
                    <span className="text-[#B88746] font-mono mt-0.5">&lt;/&gt;</span>
                    <span>Uses Jinja2 templating engine (potential SSTI risks)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#EA580C] mt-0.5">⬡</span>
                    <span>Several dependencies are outdated</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#10B981] mt-0.5">✓</span>
                    <span>Good security practices overall</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#10B981] mt-0.5">✓</span>
                    <span>Well-structured project with comprehensive tests</span>
                  </li>
                </ul>
              </div>

              {/* Right Quick Actions (~40% stacked) */}
              <div className="md:col-span-5 flex flex-col justify-between">
                <h4 className="text-[12.5px] font-bold text-[#171717] mb-2">Quick Actions</h4>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadReport}
                    className="flex items-center gap-2 rounded-xl border border-[#EBE7DF] bg-white px-3 py-2 text-[11.5px] font-semibold text-[#171717] hover:bg-[#FAF9F6] transition shadow-2xs text-left"
                  >
                    <FileText size={13} className="text-[#8A857E]" />
                    <span>View Detailed Report</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/patches")}
                    className="flex items-center gap-2 rounded-xl border border-[#EBE7DF] bg-white px-3 py-2 text-[11.5px] font-semibold text-[#171717] hover:bg-[#FAF9F6] transition shadow-2xs text-left"
                  >
                    <Wrench size={13} className="text-[#8A857E]" />
                    <span>Generate Fixes</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toast("Pull Request creation modal ready")}
                    className="flex items-center gap-2 rounded-xl border border-[#EBE7DF] bg-white px-3 py-2 text-[11.5px] font-semibold text-[#171717] hover:bg-[#FAF9F6] transition shadow-2xs text-left"
                  >
                    <GitPullRequest size={13} className="text-[#8A857E]" />
                    <span>Create Pull Request</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMN 3: Donut Chart & Category Breakdown (4 columns on lg) */}
        <div className="lg:col-span-4 rounded-2xl border border-[#EBE7DF] bg-white p-5 shadow-xs space-y-5">
          <div>
            <h3 className="font-bold text-[15px] text-[#171717]">Findings by Severity</h3>
            <p className="text-[12px] text-[#8A857E]">Triaged security and quality observations</p>
          </div>

          {/* Donut Chart with Legend on the Right (Matches Reference Layout) */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative grid h-36 w-36 shrink-0 place-items-center">
              <svg viewBox="0 0 100 100" className="h-36 w-36 -rotate-90 transform">
                {/* Segments: Critical 8%, High 21%, Medium 33%, Low 25%, Info 13% */}
                <circle cx="50" cy="50" r="38" stroke="#EF4444" strokeWidth="11" fill="transparent" strokeDasharray="19 238" strokeDashoffset="0" />
                <circle cx="50" cy="50" r="38" stroke="#F97316" strokeWidth="11" fill="transparent" strokeDasharray="50 238" strokeDashoffset="-19" />
                <circle cx="50" cy="50" r="38" stroke="#F59E0B" strokeWidth="11" fill="transparent" strokeDasharray="78 238" strokeDashoffset="-69" />
                <circle cx="50" cy="50" r="38" stroke="#3B82F6" strokeWidth="11" fill="transparent" strokeDasharray="60 238" strokeDashoffset="-147" />
                <circle cx="50" cy="50" r="38" stroke="#94A3B8" strokeWidth="11" fill="transparent" strokeDasharray="31 238" strokeDashoffset="-207" />
              </svg>
              <div className="absolute text-center">
                <span className="font-bold text-2xl text-[#171717] block leading-none">
                  24
                </span>
                <span className="text-[10px] font-medium text-[#8A857E] mt-0.5 block">
                  Total Findings
                </span>
              </div>
            </div>

            {/* Severity Legend on Right */}
            <div className="flex-1 space-y-1.5 text-[11.5px]">
              <div className="flex items-center justify-between text-[#5C5852]">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#EF4444]" /> Critical
                </span>
                <span className="font-medium text-[#171717]">2 (8%)</span>
              </div>
              <div className="flex items-center justify-between text-[#5C5852]">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#F97316]" /> High
                </span>
                <span className="font-medium text-[#171717]">5 (21%)</span>
              </div>
              <div className="flex items-center justify-between text-[#5C5852]">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#F59E0B]" /> Medium
                </span>
                <span className="font-medium text-[#171717]">8 (33%)</span>
              </div>
              <div className="flex items-center justify-between text-[#5C5852]">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#3B82F6]" /> Low
                </span>
                <span className="font-medium text-[#171717]">6 (25%)</span>
              </div>
              <div className="flex items-center justify-between text-[#5C5852]">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#94A3B8]" /> Info
                </span>
                <span className="font-medium text-[#171717]">3 (13%)</span>
              </div>
            </div>
          </div>

          {/* Top Issue Categories */}
          <div className="border-t border-[#F2EEE7] pt-4 space-y-3">
            <h4 className="text-[13px] font-bold text-[#171717]">Top Issue Categories</h4>
            <div className="space-y-2.5 text-[12px]">
              <div>
                <div className="flex justify-between text-[#5C5852] mb-1">
                  <span className="flex items-center gap-1.5">
                    <ShieldAlert size={12} className="text-[#EF4444]" /> Security
                  </span>
                  <span className="font-bold text-[#171717]">10</span>
                </div>
                <div className="h-1.5 w-full bg-[#FAF9F6] rounded-full overflow-hidden border border-[#EBE7DF]">
                  <div className="h-full bg-[#EF4444] rounded-full" style={{ width: "80%" }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#5C5852] mb-1">
                  <span className="flex items-center gap-1.5">
                    <Code2 size={12} className="text-[#F97316]" /> Code Quality
                  </span>
                  <span className="font-bold text-[#171717]">6</span>
                </div>
                <div className="h-1.5 w-full bg-[#FAF9F6] rounded-full overflow-hidden border border-[#EBE7DF]">
                  <div className="h-full bg-[#F97316] rounded-full" style={{ width: "50%" }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#5C5852] mb-1">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="text-[#3B82F6]" /> Best Practices
                  </span>
                  <span className="font-bold text-[#171717]">4</span>
                </div>
                <div className="h-1.5 w-full bg-[#FAF9F6] rounded-full overflow-hidden border border-[#EBE7DF]">
                  <div className="h-full bg-[#3B82F6] rounded-full" style={{ width: "35%" }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#5C5852] mb-1">
                  <span className="flex items-center gap-1.5">
                    <FileText size={12} className="text-[#10B981]" /> Documentation
                  </span>
                  <span className="font-bold text-[#171717]">4</span>
                </div>
                <div className="h-1.5 w-full bg-[#FAF9F6] rounded-full overflow-hidden border border-[#EBE7DF]">
                  <div className="h-full bg-[#10B981] rounded-full" style={{ width: "35%" }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
