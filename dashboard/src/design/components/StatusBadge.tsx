import React from "react";
import type { AgentStatus } from "../types";

const TONE: Record<AgentStatus | string, { label?: string; cls: string }> = {
  idle: { cls: "bg-slate-idle/10 text-dim border-slate-idle/30" },
  queued: { label: "Queued", cls: "bg-slate-idle/10 text-fog border-slate-idle/30" },
  working: { label: "Working", cls: "bg-indigo-brand/10 text-indigo-soft border-indigo-brand/40" },
  success: { label: "Complete", cls: "bg-emerald-brand/10 text-emerald-brand border-emerald-brand/40" },
  warning: { label: "Warning", cls: "bg-amber-brand/10 text-amber-brand border-amber-brand/40" },
  failed: { label: "Failed", cls: "bg-red-brand/10 text-red-brand border-red-brand/40" },
  human_review: { label: "Needs review", cls: "bg-red-brand/10 text-red-brand border-red-brand/40" },
};

export default function StatusBadge({
  status,
  label,
  pulse = false,
}: {
  status: AgentStatus | string;
  label?: string;
  pulse?: boolean;
}) {
  const tone = TONE[status] ?? TONE.idle;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide ${tone.cls}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full bg-current ${pulse ? "animate-pulse" : ""}`}
        aria-hidden
      />
      {label ?? tone.label ?? status}
    </span>
  );
}
