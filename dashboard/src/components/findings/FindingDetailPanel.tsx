import React from "react";
import { ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { VulnerabilityRemediationView } from "@/components/remediation/VulnerabilityRemediationView";
import { Finding, FindingArtifacts } from "@/types";
import { clsx } from "clsx";

interface FindingDetailPanelProps {
  finding: Finding | null;
  artifacts: FindingArtifacts | null;
  loadingArtifacts?: boolean;
  onClose?: () => void;
  onReviewDecision?: (decision: "approved" | "rejected", notes?: string) => Promise<void>;
  className?: string;
}

export const FindingDetailPanel: React.FC<FindingDetailPanelProps> = ({
  finding,
  artifacts,
  loadingArtifacts = false,
  onClose,
  onReviewDecision,
  className,
}) => {
  if (!finding) {
    return (
      <Card
        variant="elevated"
        className={clsx(
          "p-12 text-center flex flex-col items-center justify-center h-full min-h-[480px] space-y-3",
          className
        )}
      >
        <div className="w-12 h-12 rounded-2xl bg-sage-900 border border-white/[0.08] flex items-center justify-center text-sage-500">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="text-base font-sans font-semibold text-white">
          Select a Finding
        </h3>
        <p className="text-xs text-sage-400 font-sans max-w-sm leading-relaxed">
          Click any vulnerability in the list to inspect source context, AST enclosing scopes, AI triage reasoning, and verified patch suggestions.
        </p>
      </Card>
    );
  }

  return (
    <VulnerabilityRemediationView
      finding={finding}
      artifacts={artifacts}
      loadingArtifacts={loadingArtifacts}
      onClose={onClose}
      onReviewDecision={onReviewDecision}
      className={className}
    />
  );
};
