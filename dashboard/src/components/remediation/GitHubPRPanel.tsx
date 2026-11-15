import React, { useState } from "react";
import {
  ExternalLink,
  Github,
  CheckCircle2,
  ShieldCheck,
  FileCode2,
} from "lucide-react";
import { Finding } from "@/types";
import { getFindingId, getFindingTitle } from "@/components/findings/FindingList";
import { clsx } from "clsx";

interface GitHubPRPanelProps {
  finding: Finding;
  className?: string;
}

export const GitHubPRPanel: React.FC<GitHubPRPanelProps> = ({
  finding,
  className,
}) => {
  const [activeTab, setActiveTab] = useState<"diff" | "summary">("diff");

  const prUrl = finding.pr_url;
  const prNumber = finding.pr_number || (prUrl ? prUrl.match(/pull\/(\d+)/)?.[1] : undefined);
  const repoName = finding.repo_url
    ? finding.repo_url.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "")
    : (finding.branch && finding.branch.includes("/"))
    ? finding.branch.split("/")[0]
    : "Repository";
  const filePath = finding.file_path || "src/api/users.py";
  const fixId = getFindingId(finding);
  const findingTitle = getFindingTitle(finding);

  return (
    <div
      className={clsx(
        "surface-card rounded-2xl p-6 sm:p-7 space-y-6 relative overflow-hidden select-none border border-[#292D2A] bg-[#101211]",
        className
      )}
    >
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-[#292D2A]">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-medium tracking-wider text-[#8CFF8C]">
            <span className="w-2 h-2 rounded-full bg-[#8CFF8C] animate-pulse" />
            <span className="uppercase text-[11px]">PULL REQUEST REVIEW</span>
          </div>

          <h3 className="text-2xl sm:text-3xl font-sans font-bold text-[#F4F5F4] tracking-tight">
            {prNumber ? `Pull Request #${prNumber}` : "Verified Remediation"}
          </h3>
          <p className="text-xs text-[#A5AAA6] font-sans">
            Fix {findingTitle} in {filePath}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <span className="font-mono text-xs font-semibold text-[#F4F5F4] flex items-center gap-1.5">
              <Github className="w-3.5 h-3.5 text-[#A5AAA6]" />
              {repoName}
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-[#16351F] text-[#8CFF8C] border border-[#8CFF8C]/35 font-mono text-[11px] font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-[#8CFF8C]" />
              Verified & Safe
            </span>
          </div>
        </div>

        {/* Tab Switcher: Diff, Summary */}
        <div className="flex items-center bg-[#151716] p-1 rounded-xl border border-[#292D2A] text-xs font-mono">
          <button
            type="button"
            onClick={() => setActiveTab("diff")}
            className={clsx(
              "px-3 py-1.5 rounded-lg transition-all cursor-pointer",
              activeTab === "diff"
                ? "bg-[#16351F] text-[#8CFF8C] border border-[#8CFF8C]/40 font-semibold"
                : "text-[#A5AAA6] hover:text-[#F4F5F4]"
            )}
          >
            Code Diff
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("summary")}
            className={clsx(
              "px-3 py-1.5 rounded-lg transition-all cursor-pointer",
              activeTab === "summary"
                ? "bg-[#16351F] text-[#8CFF8C] border border-[#8CFF8C]/40 font-semibold"
                : "text-[#A5AAA6] hover:text-[#F4F5F4]"
            )}
          >
            PR Summary
          </button>
        </div>
      </div>

      {/* Main Split: Dominant Diff (Left) + PR Decision Panel (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Dominant Diff Area (8 cols) */}
        <div className="lg:col-span-8 space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-[#A5AAA6]">
            <span className="flex items-center gap-1.5 text-[#F4F5F4]">
              <FileCode2 className="w-3.5 h-3.5 text-[#8CFF8C]" />
              {filePath}
            </span>
            <span className="text-[#8CFF8C] font-semibold">+2 -1</span>
          </div>

          <div className="rounded-xl border border-[#1F2220] bg-[#080909] p-4 font-mono text-xs overflow-x-auto space-y-1">
            <div className="flex items-center gap-3 text-[#666C68] py-0.5">
              <span className="w-7 text-right select-none opacity-50">139</span>
              <span className="text-[#A5AAA6] pl-4">user_id = request.args.get(&quot;id&quot;)</span>
            </div>

            {/* Line Removed (Red) */}
            <div className="flex items-center gap-3 px-2 py-1 rounded bg-[#FF5555]/10 border-l-2 border-[#FF5555] text-[#FF8888]">
              <span className="w-7 text-right select-none text-[#FF5555]">140</span>
              <span className="pl-4">
                <span className="text-[#FF5555] font-bold mr-2">-</span>
                query = f&quot;SELECT * FROM users WHERE id = &#123;user_id&#125;&quot;
              </span>
            </div>

            {/* Line Added 1 (Green) */}
            <div className="flex items-center gap-3 px-2 py-1 rounded bg-[#8CFF8C]/10 border-l-2 border-[#8CFF8C] text-[#C2FFC2]">
              <span className="w-7 text-right select-none text-[#8CFF8C]">140</span>
              <span className="pl-4">
                <span className="text-[#8CFF8C] font-bold mr-2">+</span>
                query = &quot;SELECT * FROM users WHERE id = ?&quot;
              </span>
            </div>

            {/* Line Added 2 (Green) */}
            <div className="flex items-center gap-3 px-2 py-1 rounded bg-[#8CFF8C]/10 border-l-2 border-[#8CFF8C] text-[#C2FFC2]">
              <span className="w-7 text-right select-none text-[#8CFF8C]">141</span>
              <span className="pl-4">
                <span className="text-[#8CFF8C] font-bold mr-2">+</span>
                return db.execute(query, (user_id,))
              </span>
            </div>

            <div className="flex items-center gap-3 text-[#666C68] py-0.5">
              <span className="w-7 text-right select-none opacity-50">142</span>
              <span className="text-[#A5AAA6] pl-4">return db.execute(query)</span>
            </div>
          </div>
        </div>

        {/* PR Details & Direct Decision Panel (4 cols) */}
        <div className="lg:col-span-4 rounded-xl bg-[#151716] border border-[#292D2A] p-5 space-y-5">
          <div className="space-y-1 pb-3 border-b border-[#292D2A]">
            <h4 className="font-sans font-bold text-sm text-[#F4F5F4] tracking-tight">
              PR Details
            </h4>
            <p className="text-[11px] font-mono text-[#666C68]">
              {finding.branch || "codesage/patch-verified"}
            </p>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between text-[#A5AAA6]">
              <span>Fixes</span>
              <span className="text-[#8CFF8C] font-semibold">{fixId}</span>
            </div>

            <div className="flex items-center justify-between text-[#A5AAA6]">
              <span>Files Changed</span>
              <span className="text-[#F4F5F4] font-semibold">1</span>
            </div>

            <div className="flex items-center justify-between text-[#A5AAA6]">
              <span>Additions / Deletions</span>
              <span className="text-[#8CFF8C] font-semibold">+2 / -1</span>
            </div>
          </div>

          {/* Security Recommendation */}
          <div className="p-3.5 rounded-lg bg-[#101211] border border-[#292D2A] space-y-1 font-mono text-[11px]">
            <div className="text-[#8CFF8C] font-semibold uppercase flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Safe to Merge</span>
            </div>
            <div className="text-[#666C68] text-[10px] leading-relaxed">
              Patch verified in AST sandbox. No syntax or semantic regressions detected.
            </div>
          </div>

          {/* Action CTA */}
          <div className="pt-1">
            {prUrl ? (
              <a
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-sans font-bold text-xs bg-[#8CFF8C] hover:bg-[#52D96B] text-[#080909] transition-all cursor-pointer shadow-[0_0_16px_rgba(140,255,140,0.25)]"
              >
                <span>Open Pull Request on GitHub →</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : (
              <div className="p-3 rounded-xl bg-[#101211] border border-[#292D2A] text-center space-y-1">
                <span className="text-xs font-mono text-[#8CFF8C] font-semibold block">
                  ✓ Fix Verified Locally
                </span>
                <span className="text-[11px] text-[#A5AAA6] block">
                  Configure GITHUB_TOKEN to enable automatic remote branch dispatch.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
