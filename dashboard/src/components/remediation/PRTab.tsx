import React from "react";
import { Finding, VerificationResult } from "@/types";
import { RemediationWorkflowSequence } from "@/components/remediation/RemediationWorkflowSequence";
import { GitHubPRPanel } from "@/components/remediation/GitHubPRPanel";
import { clsx } from "clsx";

interface PRTabProps {
  finding: Finding;
  verification?: VerificationResult | null;
  className?: string;
}

export const PRTab: React.FC<PRTabProps> = ({
  finding,
  verification,
  className,
}) => {
  const prUrl = finding.pr_url;
  const isVerified = verification?.passed ?? (finding.status?.includes("verified") ?? false);
  const isPrOpened = Boolean(prUrl) || finding.status === "verified_pr_opened";
  const isPrSkipped = finding.status === "verified_pr_skipped";
  const isPrFailed = finding.status === "pr_failed";

  const prNumberMatch = prUrl?.match(/pull\/(\d+)/);
  const prNumber = finding.pr_number || (prNumberMatch ? prNumberMatch[1] : null);

  const branchName =
    finding.branch ||
    `codesage/fix-${finding.file_path.split("/").pop()?.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase() || "patch"}`;

  return (
    <div className={clsx("space-y-6", className)}>
      {/* 1. Animated Remediation Staged Sequence */}
      <RemediationWorkflowSequence
        isVerified={isVerified}
        isPrOpened={isPrOpened}
        isPrSkipped={isPrSkipped}
        isPrFailed={isPrFailed}
        branchName={branchName}
        prNumber={prNumber}
        prUrl={prUrl}
        failureReason={finding.failure_reason}
      />

      {/* 2. Real GitHub PR Panel / Failure State */}
      <GitHubPRPanel finding={finding} />
    </div>
  );
};
