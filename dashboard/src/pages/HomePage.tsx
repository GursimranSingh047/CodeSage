import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Terminal,
  Zap,
  GitBranch,
  Cpu,
  Lock,
  Layers,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cardEntrance, staggerContainer } from "@/animations/variants";

interface HomePageProps {
  onStartScan?: (repoUrl: string, branch?: string, scanners?: string[]) => void;
  isScanning?: boolean;
}

export const HomePage: React.FC<HomePageProps> = ({
  onStartScan,
  isScanning = false,
}) => {
  const [repoUrl, setRepoUrl] = useState("test-target-repo");
  const [branch, setBranch] = useState("");
  const [selectedScanners, setSelectedScanners] = useState<string[]>([
    "semgrep",
    "bandit",
    "gitleaks",
  ]);

  const toggleScanner = (scanner: string) => {
    setSelectedScanners((prev) =>
      prev.includes(scanner)
        ? prev.filter((s) => s !== scanner)
        : [...prev, scanner]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim() || isScanning) return;
    onStartScan?.(repoUrl.trim(), branch.trim() || undefined, selectedScanners);
  };

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-10"
    >
      {/* Hero Header */}
      <motion.div variants={cardEntrance} className="text-center max-w-3xl mx-auto space-y-4 pt-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-accent-orange/30 bg-accent-orange/10 text-accent-orange text-xs font-mono font-medium">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Autonomous End-to-End Vulnerability Remediator</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-sans font-bold tracking-tight text-white">
          Security Audits and Patches,{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-orange via-amber-400 to-accent-violet">
            Engineered Autonomously.
          </span>
        </h1>
        <p className="text-base text-sage-300 font-sans leading-relaxed">
          Ingest codebases, isolate false positives through AI triage, synthesize verifiable patches,
          and open pull requests with zero alert fatigue.
        </p>
      </motion.div>

      {/* Main Scan Configuration Panel */}
      <motion.div variants={cardEntrance} className="max-w-2xl mx-auto">
        <Card variant="elevated" className="p-6 sm:p-8 relative overflow-hidden" glow="orange">
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent-orange/5 rounded-full blur-3xl pointer-events-none" />
          
          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
            <div>
              <label className="block text-xs font-mono font-medium uppercase tracking-wider text-sage-300 mb-2">
                Repository Target
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-sage-400">
                  <Terminal className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/org/repo or local path"
                  disabled={isScanning}
                  className="w-full pl-10 pr-4 py-2.5 bg-sage-900 border border-white/[0.1] rounded-xl text-sage-100 placeholder-sage-500 font-mono text-sm focus:outline-none focus:border-accent-orange/50 focus:ring-1 focus:ring-accent-orange/50 transition-all disabled:opacity-50"
                />
              </div>
              <p className="mt-1.5 text-[11px] font-mono text-sage-400 flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-emerald-400" />
                Protected: Strict symlink confinement & pre-clone gatekeeping active.
              </p>
            </div>

            {/* Branch and Scanners Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono font-medium uppercase tracking-wider text-sage-300 mb-2">
                  Target Branch (Optional)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-sage-400">
                    <GitBranch className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="main or develop"
                    disabled={isScanning}
                    className="w-full pl-9 pr-3 py-2 bg-sage-900 border border-white/[0.1] rounded-lg text-sage-100 placeholder-sage-500 font-mono text-xs focus:outline-none focus:border-accent-orange/50 transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-medium uppercase tracking-wider text-sage-300 mb-2">
                  Active Scanners
                </label>
                <div className="flex items-center gap-1.5 pt-0.5">
                  {[
                    { id: "semgrep", label: "Semgrep" },
                    { id: "bandit", label: "Bandit" },
                    { id: "gitleaks", label: "Gitleaks" },
                  ].map((s) => {
                    const active = selectedScanners.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleScanner(s.id)}
                        disabled={isScanning}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-all border ${
                          active
                            ? "bg-accent-orange/15 text-orange-300 border-accent-orange/30 font-medium"
                            : "bg-sage-900 text-sage-400 border-white/[0.08] hover:border-white/[0.15]"
                        }`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Launch Action */}
            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={isScanning}
                disabled={!repoUrl.trim() || selectedScanners.length === 0}
                className="w-full"
                icon={<Zap className="w-4 h-4 fill-current" />}
              >
                {isScanning ? "Autonomous Pipeline Running..." : "Start Security Audit & Patch Run"}
              </Button>
            </div>
          </form>
        </Card>
      </motion.div>

      {/* Architectural Guarantees Grid */}
      <motion.div variants={cardEntrance} className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto pt-4">
        <Card className="p-5 space-y-3" glow="violet">
          <div className="w-9 h-9 rounded-lg bg-accent-violet/10 border border-accent-violet/20 flex items-center justify-center text-accent-violet">
            <Cpu className="w-5 h-5" />
          </div>
          <h3 className="font-sans font-semibold text-white text-sm">
            AST Contextual Triage
          </h3>
          <p className="text-xs text-sage-400 font-sans leading-relaxed">
            Tree-sitter extracts enclosing function scopes, dependencies, and vector-embedded
            context to eliminate false alarms with calibrated confidence scores.
          </p>
        </Card>

        <Card className="p-5 space-y-3" glow="teal">
          <div className="w-9 h-9 rounded-lg bg-accent-teal/10 border border-accent-teal/20 flex items-center justify-center text-accent-teal">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="font-sans font-semibold text-white text-sm">
            Sandbox Patch Verification
          </h3>
          <p className="text-xs text-sage-400 font-sans leading-relaxed">
            Every candidate fix is verified in an isolated execution sandbox: static analysis
            is re-run and automated unit tests are executed before code leaves the container.
          </p>
        </Card>

        <Card className="p-5 space-y-3" glow="orange">
          <div className="w-9 h-9 rounded-lg bg-accent-orange/10 border border-accent-orange/20 flex items-center justify-center text-accent-orange">
            <Layers className="w-5 h-5" />
          </div>
          <h3 className="font-sans font-semibold text-white text-sm">
            Fast Incremental Scanning
          </h3>
          <p className="text-xs text-sage-400 font-sans leading-relaxed">
            Cryptographic SHA-256 file hash tracking bypasses untouched code, running targeted
            scans exclusively on modified or newly committed files.
          </p>
        </Card>
      </motion.div>
    </motion.div>
  );
};
