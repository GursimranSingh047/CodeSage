import React from "react";
import { ChevronRight } from "lucide-react";
import type { Finding, Severity } from "../types";

const SEV: Record<Severity, { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "border-red-brand/50 bg-red-brand/10 text-red-brand" },
  high: { label: "High", cls: "border-red-brand/40 bg-red-brand/5 text-red-brand" },
  medium: { label: "Medium", cls: "border-amber-brand/40 bg-amber-brand/10 text-amber-brand" },
  low: { label: "Low", cls: "border-edge bg-raised text-fog" },
};

export default function FindingCard({ finding }: { finding: Finding }) {
  const sev = SEV[finding.severity];
  return (
    <button
      type="button"
      className="group w-full rounded-xl border border-edge bg-surface px-4 py-3 text-left transition-all hover:-translate-y-px hover:border-edge-strong hover:shadow-lg hover:shadow-black/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-brand"
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${sev.cls}`}>
          {sev.label}
        </span>
        <ChevronRight size={15} className="mt-0.5 shrink-0 text-dim transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
      </div>
      <p className="mt-2 text-[13px] font-medium leading-snug text-ink">{finding.title}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-dim">
        <span className="font-mono">
          {finding.file}:{finding.line}
        </span>
        <span aria-hidden>·</span>
        <span>{Math.round(finding.confidence * 100)}% confidence</span>
        <span aria-hidden>·</span>
        <span className={finding.state.includes("PR") ? "text-emerald-brand" : "text-fog"}>{finding.state}</span>
      </div>
    </button>
  );
}
