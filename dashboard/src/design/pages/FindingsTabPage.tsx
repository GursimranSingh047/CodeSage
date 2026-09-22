import React from "react";
import { useScanFlow } from "../ScanFlowContext";
import NotchedCard from "../components/NotchedCard";
import EmptyState from "../components/EmptyState";

/** "Findings" tab — every finding the pipeline surfaced for this run. */
export default function FindingsTabPage() {
  const { run } = useScanFlow();
  const findings = run.findings;

  return (
    <div className="relative min-h-screen bg-void font-sans text-ink">
      <div className="grid-bg" aria-hidden />
      <div className="relative z-10 mx-auto max-w-4xl px-6 pb-20 pt-10">
        <p className="text-[15px] text-fog">Findings</p>
        <h1 className="font-display mb-8 text-4xl font-bold tracking-tight">
          All findings <span className="text-fog">({findings.length})</span>
        </h1>
        {findings.length === 0 ? (
          <EmptyState title="No findings recorded" hint="Run a scan from the pipeline page first." />
        ) : (
          <div className="space-y-3">
            {findings.map((f) => (
              <NotchedCard key={f.id} corner="top-right" innerClassName="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-ink">{f.title}</p>
                    <p className="mt-1 font-mono text-[11.5px] text-fog">
                      {f.file}:{f.line} · {f.cwe || "CWE —"} · {Math.round(f.confidence * 100)}% confidence
                    </p>
                  </div>
                  <span
                    className={`notch-tr px-3 py-1 text-[11px] font-bold ${
                      f.severity === "high"
                        ? "bg-red-brand/15 text-red-brand"
                        : f.severity === "medium"
                        ? "bg-amber-brand/15 text-amber-brand"
                        : "bg-raised text-fog"
                    }`}
                  >
                    {f.severity.toUpperCase()}
                  </span>
                </div>
                <p className="mt-2 text-[12px] text-fog">{f.state}</p>
              </NotchedCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
