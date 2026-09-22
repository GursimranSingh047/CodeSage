import React from "react";
import { useNavigate } from "react-router-dom";
import { GitPullRequest } from "lucide-react";
import { useScanFlow } from "../ScanFlowContext";
import NotchedCard from "../components/NotchedCard";
import EmptyState from "../components/EmptyState";
import NotchedButton from "../components/NotchedButton";

/** "Patches" tab — confirmed findings with drafted, verified fixes. */
export default function PatchesPage() {
  const { run } = useScanFlow();
  const navigate = useNavigate();
  const patched = run.findings.filter(
    (f) => f.state.includes("Patch") || f.state.includes("PR")
  );

  return (
    <div className="relative min-h-screen bg-void font-sans text-ink">
      <div className="grid-bg" aria-hidden />
      <div className="relative z-10 mx-auto max-w-4xl px-6 pb-20 pt-10">
        <p className="text-[15px] text-fog">Patches</p>
        <h1 className="font-display mb-8 text-4xl font-bold tracking-tight">
          Proposed fixes <span className="text-fog">({patched.length})</span>
        </h1>
        {patched.length === 0 ? (
          <EmptyState
            title="No patches yet"
            hint="Patches appear here after the Triage and Patch agents confirm and draft fixes."
            action={
              <NotchedButton onClick={() => navigate("/pipeline")}>Go to pipeline</NotchedButton>
            }
          />
        ) : (
          <div className="space-y-3">
            {patched.map((f) => (
              <NotchedCard key={f.id} corner="bottom-left" innerClassName="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-ink">{f.title}</p>
                    <p className="mt-1 font-mono text-[11.5px] text-fog">
                      {f.file}:{f.line}
                    </p>
                  </div>
                  <span className="notch-tr inline-flex items-center gap-1.5 bg-mint px-3 py-1 text-[11px] font-bold text-black">
                    <GitPullRequest size={11} /> {f.state}
                  </span>
                </div>
              </NotchedCard>
            ))}
            <p className="pt-4 text-[12.5px] text-dim">
              Nothing is merged automatically — review each pull request before merging.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
