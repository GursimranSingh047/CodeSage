import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Github,
  GitBranch,
  Terminal,
  ShieldAlert,
  ShieldCheck,
  Zap,
  ExternalLink,
  Star,
  GitFork,
  Eye,
  CheckCircle2,
  Sparkles,
  FileCode,
  AlertTriangle,
  Layers,
  ArrowRight,
  RefreshCw,
  Info,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Tabs } from "@/components/ui/Tabs";
import { Tooltip } from "@/components/ui/Tooltip";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { cardEntrance, staggerContainer } from "@/animations/variants";

export const OverviewPage: React.FC = () => {
  const [repoInput, setRepoInput] = useState("https://github.com/pallets/flask");
  const [selectedBranch, setSelectedBranch] = useState("main");
  const [activeTab, setActiveTab] = useState("overview");
  const [showSkeletonDemo, setShowSkeletonDemo] = useState(false);
  const [showErrorDemo, setShowErrorDemo] = useState(false);
  const [showEmptyDemo, setShowEmptyDemo] = useState(false);

  const branchOptions = [
    { value: "main", label: "main", description: "Default production branch" },
    { value: "develop", label: "develop", description: "Active feature integration" },
    { value: "release-v2.0", label: "release-v2.0", description: "Release preparation" },
  ];

  const mainTabs = [
    { id: "overview", label: "Overview", icon: <Layers className="w-3.5 h-3.5" /> },
    { id: "findings", label: "Findings", count: 24, icon: <ShieldAlert className="w-3.5 h-3.5" /> },
    { id: "files", label: "File Explorer", icon: <FileCode className="w-3.5 h-3.5" /> },
    { id: "ai", label: "AI Insights", icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: "fixes", label: "Fix Suggestions", count: 6, icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  ];

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* 1. Page Header (Ref Visual Reference) */}
      <motion.div variants={cardEntrance} className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-accent-orange font-medium">
          <Terminal className="w-3.5 h-3.5" />
          <span>GitHub Repository Security & Engineering Analysis</span>
        </div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-sans font-bold tracking-tight text-white">
              Analyze <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-orange to-accent-violet">Any</span> GitHub Repository
            </h1>
            <p className="text-xs sm:text-sm text-sage-400 font-sans mt-1 max-w-2xl">
              Autonomous engineering audit with static code analysis, AST context extraction,
              AI vulnerability triage, and verified patch generation.
            </p>
          </div>

          {/* Quick Feature Capabilities Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="violet" size="sm" dot>Security Analysis</Badge>
            <Badge variant="teal" size="sm" dot>Code Quality</Badge>
            <Badge variant="orange" size="sm" dot>AI Insights</Badge>
          </div>
        </div>
      </motion.div>

      {/* 2. Repository Search & Configuration Card */}
      <motion.div variants={cardEntrance}>
        <Card variant="elevated" className="p-5 sm:p-6" glow="orange">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-end gap-3.5">
            <div className="flex-1">
              <Input
                label="Target Repository"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                icon={<Github className="w-4 h-4" />}
                placeholder="https://github.com/owner/repository or local path"
                hint="Supports public GitHub repositories and approved local test paths"
              />
            </div>

            <div className="w-full lg:w-48">
              <Dropdown
                label="Branch"
                options={branchOptions}
                value={selectedBranch}
                onChange={setSelectedBranch}
              />
            </div>

            <div className="shrink-0 flex items-center gap-2">
              <Button
                variant="primary"
                size="md"
                icon={<Zap className="w-4 h-4 fill-current" />}
                iconRight={<ArrowRight className="w-4 h-4" />}
              >
                Analyze Repository
              </Button>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-sage-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Public repositories supported
              </span>
              <span className="text-sage-500">&bull;</span>
              <span>Private repos require GITHUB_TOKEN</span>
            </div>
            <Tooltip content="CodeSage clones shallowly and validates refnames before launching scanners">
              <span className="text-accent-teal hover:underline cursor-pointer flex items-center gap-1">
                <Info className="w-3 h-3" /> How does ingestion work?
              </span>
            </Tooltip>
          </div>
        </Card>
      </motion.div>

      {/* 3. Repository Identity & Metadata Header (Ref Visual Reference) */}
      <motion.div variants={cardEntrance}>
        <Card className="p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-sage-900 border border-white/[0.1] flex items-center justify-center text-white shrink-0 shadow-sm">
                <Github className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="font-sans font-bold text-lg text-white">
                    pallets / flask
                  </h2>
                  <Badge variant="teal" size="xs">Public</Badge>
                  <Badge variant="neutral" size="xs">Python</Badge>
                </div>
                <p className="text-xs text-sage-400 font-sans mt-0.5">
                  A simple framework for building complex web applications.
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              icon={<ExternalLink className="w-3.5 h-3.5" />}
              onClick={() => window.open("https://github.com/pallets/flask", "_blank")}
            >
              View on GitHub
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-sage-900/60 border border-white/[0.05] flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <div className="text-white font-bold">67.5k</div>
                <div className="text-[10px] text-sage-500 uppercase">Stars</div>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-sage-900/60 border border-white/[0.05] flex items-center gap-2">
              <GitFork className="w-4 h-4 text-accent-violet shrink-0" />
              <div>
                <div className="text-white font-bold">18.2k</div>
                <div className="text-[10px] text-sage-500 uppercase">Forks</div>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-sage-900/60 border border-white/[0.05] flex items-center gap-2">
              <Eye className="w-4 h-4 text-accent-teal shrink-0" />
              <div>
                <div className="text-white font-bold">2.1k</div>
                <div className="text-[10px] text-sage-500 uppercase">Watchers</div>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-sage-900/60 border border-white/[0.05] flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-accent-orange shrink-0" />
              <div>
                <div className="text-white font-bold">main</div>
                <div className="text-[10px] text-sage-500 uppercase">Default Branch</div>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* 4. Active Pipeline Progression Card */}
      <motion.div variants={cardEntrance}>
        <Card variant="elevated" className="p-5 space-y-4 border-accent-orange/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-accent-orange animate-pulse" />
              <span className="font-sans font-semibold text-sm text-white">
                Analysis in Progress
              </span>
              <span className="text-xs text-sage-400 font-mono hidden sm:inline">
                Scanning repository, running static analysis & LLM triage...
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-accent-orange font-semibold">
                Stage 4 of 6 (65%)
              </span>
              <Button variant="danger" size="xs">
                Cancel Scan
              </Button>
            </div>
          </div>

          {/* Stepper bar */}
          <div className="relative pt-2">
            <div className="h-1.5 w-full bg-sage-850 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-accent-orange via-accent-violet to-accent-teal w-[65%] rounded-full transition-all duration-500" />
            </div>

            <div className="grid grid-cols-6 gap-2 mt-3 text-[10px] font-mono text-center">
              <span className="text-emerald-400 font-medium">1. Ingest</span>
              <span className="text-emerald-400 font-medium">2. Semgrep</span>
              <span className="text-emerald-400 font-medium">3. Bandit</span>
              <span className="text-accent-orange font-bold">4. AI Triage</span>
              <span className="text-sage-500">5. Verify</span>
              <span className="text-sage-500">6. Pull Request</span>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* 5. Segmented Navigation Tabs */}
      <motion.div variants={cardEntrance} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Tabs tabs={mainTabs} activeTab={activeTab} onChange={setActiveTab} />
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />}>
            Re-run Audit
          </Button>
          <Button variant="secondary" size="sm" icon={<ExternalLink className="w-3.5 h-3.5" />}>
            Export JSON
          </Button>
        </div>
      </motion.div>

      {/* 6. Overview Metrics & Breakdown Grid (Ref Visual Reference) */}
      <motion.div variants={cardEntrance} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Severity Summary */}
        <div className="space-y-4">
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <span className="font-sans font-semibold text-sm text-white">
                Findings by Severity
              </span>
              <Badge variant="critical" size="xs" dot>24 Total</Badge>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 space-y-1">
                <div className="text-2xl font-mono font-bold text-rose-400">2</div>
                <div className="text-[11px] font-mono uppercase text-rose-300">Critical</div>
              </div>

              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-1">
                <div className="text-2xl font-mono font-bold text-rose-400">5</div>
                <div className="text-[11px] font-mono uppercase text-rose-300">High</div>
              </div>

              <div className="p-3 rounded-xl bg-accent-orange-muted border border-accent-orange/25 space-y-1">
                <div className="text-2xl font-mono font-bold text-orange-400">8</div>
                <div className="text-[11px] font-mono uppercase text-orange-300">Medium</div>
              </div>

              <div className="p-3 rounded-xl bg-accent-teal-muted border border-accent-teal/25 space-y-1">
                <div className="text-2xl font-mono font-bold text-teal-400">6</div>
                <div className="text-[11px] font-mono uppercase text-teal-300">Low</div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-sage-900 border border-white/[0.06] flex items-center justify-between text-xs font-mono">
              <span className="text-sage-400">Informational / Style:</span>
              <span className="text-sage-200 font-bold">3</span>
            </div>
          </Card>

          {/* Verification Box */}
          <Card className="p-5 space-y-3" glow="teal">
            <div className="flex items-center gap-2 text-accent-teal text-xs font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>Sandbox Verification Guarantee</span>
            </div>
            <p className="text-xs text-sage-400 font-sans leading-relaxed">
              6 patches synthesized & tested in isolated sandbox. 100% of candidate fixes
              pass clean static analysis rescans before PR generation.
            </p>
          </Card>
        </div>

        {/* Center Column: Detected Technologies & Key Insights */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <span className="font-sans font-semibold text-sm text-white">
                Detected Technologies & Languages
              </span>
              <span className="text-xs font-mono text-sage-400">Dominant: Python</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="teal" size="sm">Python (78%)</Badge>
              <Badge variant="violet" size="sm">Jinja2 (12%)</Badge>
              <Badge variant="orange" size="sm">HTML (5%)</Badge>
              <Badge variant="default" size="sm">CSS (3%)</Badge>
              <Badge variant="default" size="sm">JavaScript (2%)</Badge>
            </div>

            <div className="space-y-2.5 pt-2">
              <div className="text-xs font-mono uppercase text-sage-400 font-semibold">
                Autonomous Security Verdicts
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-3 rounded-xl bg-sage-900/90 border border-white/[0.06] flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-white">SQL Injection Remediated (CWE-89)</div>
                    <div className="text-[11px] text-sage-400 font-mono mt-0.5">
                      shop.py:17 parameterized using query placeholders; verified clean in sandbox.
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-sage-900/90 border border-white/[0.06] flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-white">Command Injection Isolated (CWE-78)</div>
                    <div className="text-[11px] text-sage-400 font-mono mt-0.5">
                      admin.py:14 converted from shell=True to safe arg list subprocess invocation.
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-sage-900/90 border border-white/[0.06] flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-white">Hardcoded Secret Identified (CWE-798)</div>
                    <div className="text-[11px] text-sage-400 font-mono mt-0.5">
                      payments.py:10 detected by Gitleaks; flagged for environment variable migration.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </motion.div>

      {/* 7. Design System Component Sandbox / Showcase Controls */}
      <motion.div variants={cardEntrance}>
        <Card className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
            <div>
              <span className="font-sans font-semibold text-sm text-white">
                Component States & Design System Showcase
              </span>
              <p className="text-[11px] font-mono text-sage-400">
                Verify UI primitives: Loading, Empty, and Error states
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={showSkeletonDemo ? "primary" : "outline"}
                size="xs"
                onClick={() => setShowSkeletonDemo((p) => !p)}
              >
                Skeleton Loader
              </Button>
              <Button
                variant={showEmptyDemo ? "primary" : "outline"}
                size="xs"
                onClick={() => setShowEmptyDemo((p) => !p)}
              >
                Empty State
              </Button>
              <Button
                variant={showErrorDemo ? "danger" : "outline"}
                size="xs"
                onClick={() => setShowErrorDemo((p) => !p)}
              >
                Error State
              </Button>
            </div>
          </div>

          {/* Conditional state demos */}
          {showSkeletonDemo && (
            <div className="p-4 rounded-xl bg-sage-900/60 border border-white/[0.06] space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton variant="circular" width={36} height={36} />
                <div className="space-y-1.5 flex-1">
                  <Skeleton variant="text" width="40%" />
                  <Skeleton variant="text" width="70%" />
                </div>
              </div>
              <Skeleton variant="rectangular" height={80} />
            </div>
          )}

          {showEmptyDemo && (
            <EmptyState
              title="No Security Vulnerabilities Detected"
              description="All configured static analysis tools and AI triage models verified that this repository complies with baseline security policies."
              actionLabel="Scan Another Branch"
              onAction={() => alert("Ready to scan another target.")}
            />
          )}

          {showErrorDemo && (
            <ErrorState
              title="Repository Ingestion Blocked"
              message="The repository path '/etc/shadow' is strictly confined and disallowed by security policy."
              onRetry={() => setShowErrorDemo(false)}
            />
          )}
        </Card>
      </motion.div>
    </motion.div>
  );
};
