import React from "react";
import { ShieldCheck, GitPullRequest, Code2, Check, Layers } from "lucide-react";

interface RepositoryStatusCardProps {
  status?: string;
  lastScanText?: string;
  fixedCount?: number;
  prCount?: number;
}

export const RepositoryStatusCard: React.FC<RepositoryStatusCardProps> = ({
  status = "Protected",
  lastScanText = "Last scan: 2 minutes ago",
  fixedCount = 2,
  prCount = 3,
}) => {
  return (
    <div className="surface-card rounded-2xl p-5 space-y-4 select-none relative overflow-hidden group hover:border-[#363C38] transition-all">
      {/* Card Header */}
      <div className="flex items-center justify-between">
        <h4 className="font-sans font-semibold text-sm text-[#F4F5F4] tracking-tight">
          Repository Status
        </h4>
        <span className="w-2 h-2 rounded-full bg-[#8CFF8C] shadow-[0_0_8px_rgba(140,255,140,0.8)]" />
      </div>

      {/* Main Status Block */}
      <div className="flex items-center gap-3 pt-1">
        <div className="w-10 h-10 rounded-xl bg-[#16351F] border border-[#8CFF8C]/35 flex items-center justify-center text-[#8CFF8C] shadow-[0_0_12px_rgba(140,255,140,0.15)]">
          <ShieldCheck className="w-5 h-5 text-[#8CFF8C]" />
        </div>
        <div>
          <h5 className="font-sans font-bold text-base text-[#8CFF8C] tracking-tight">
            {status}
          </h5>
          <p className="font-mono text-[11px] text-[#A5AAA6]">
            {lastScanText}
          </p>
        </div>
      </div>

      {/* Technical Checklist Metrics */}
      <div className="pt-2 space-y-2 border-t border-[#292D2A] text-xs font-mono">
        <div className="flex items-center gap-2.5 text-[#A5AAA6]">
          <Code2 className="w-3.5 h-3.5 text-[#8CFF8C] shrink-0" />
          <span>{fixedCount} issues fixed</span>
        </div>

        <div className="flex items-center gap-2.5 text-[#A5AAA6]">
          <GitPullRequest className="w-3.5 h-3.5 text-[#52D96B] shrink-0" />
          <span>{prCount} pull requests opened</span>
        </div>

        <div className="flex items-center gap-2.5 text-[#A5AAA6]">
          <Check className="w-3.5 h-3.5 text-[#8CFF8C] shrink-0" />
          <span>No new critical issues</span>
        </div>

        <div className="flex items-center gap-2.5 text-[#A5AAA6]">
          <Layers className="w-3.5 h-3.5 text-[#666C68] shrink-0" />
          <span>Auto-monitoring enabled</span>
        </div>
      </div>
    </div>
  );
};
