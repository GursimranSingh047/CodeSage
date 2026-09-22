import React from "react";

const LABELS = {
  verified_pr_opened: "PR Opened",
  verified_pr_skipped: "Verified",
  needs_human_review: "Needs Review",
  false_positive: "False Positive",
  triage_failed: "Triage Failed",
  patch_generation_failed: "Patch Failed",
  pr_failed: "PR Failed",
};

const KINDS = {
  verified_pr_opened: "ok",
  verified_pr_skipped: "ok",
  needs_human_review: "review",
  false_positive: "muted",
  triage_failed: "failed",
  patch_generation_failed: "failed",
  pr_failed: "failed",
};

export default function StatusBadge({ status }) {
  return (
    <span className={`badge badge-${KINDS[status] || "muted"}`}>
      {LABELS[status] || status}
    </span>
  );
}
