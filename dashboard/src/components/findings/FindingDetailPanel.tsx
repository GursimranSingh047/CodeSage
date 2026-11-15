import React from "react";
import { ShieldAlert } from "lucide-react";
import { FindingDetailWorkspace } from "@/components/findings/FindingDetailWorkspace";
import { Finding, FindingArtifacts } from "@/types";
import { clsx } from "clsx";

interface FindingDetailPanelProps {
  finding: Finding | null;
  artifacts: FindingArtifacts | null;
  loadingArtifacts?: boolean;
  scanId?: string;
  onPrCreated?: (prInfo: {
    pr_number: number;
    pr_url: string;
    branch: string;
    base_branch: string;
  }) => void;
  onClose?: () => void;
  onReviewDecision?: (decision: "approved" | "rejected", notes?: string) => Promise<void>;
  onMarkResolved?: (findingId: string) => void;
  className?: string;
}

export const FindingDetailPanel: React.FC<FindingDetailPanelProps> = ({
  finding,
  artifacts,
  loadingArtifacts = false,
  scanId,
  onPrCreated,
  onClose,
  onReviewDecision,
  onMarkResolved,
  className,
}) => {
  if (!finding) {
    return (
      <div
        className={clsx(
          "surface-card rounded-2xl p-12 text-center flex flex-col items-center justify-center h-full min-h-[480px] space-y-4 border border-[#292D2A] select-none",
          className
        )}
      >
        <div className="w-12 h-12 rounded-2xl bg-[#151716] border border-[#292D2A] flex items-center justify-center text-[#8CFF8C]">
          <ShieldAlert className="w-6 h-6 text-[#8CFF8C]" />
        </div>
        <div className="space-y-1.5 max-w-sm">
          <h3 className="text-base font-sans font-bold text-[#F4F5F4]">
            Select a Security Finding
          </h3>
          <p className="text-xs text-[#A5AAA6] font-sans leading-relaxed">
            Click any vulnerability in the technical audit table to inspect vulnerability details,
            exploitability, impact ratings, AST source context, and run verified remediations.
          </p>
        </div>
      </div>
    );
  }

  return (
    <FindingDetailWorkspace
      finding={finding}
      artifacts={artifacts}
      loadingArtifacts={loadingArtifacts}
      scanId={scanId}
      onPrCreated={onPrCreated}
      onClose={onClose}
      onReviewDecision={onReviewDecision}
      onMarkResolved={onMarkResolved}
      className={className}
    />
  );
};
