export type PipelineStageId =
  | "ingestion"
  | "scanning"
  | "context"
  | "triage"
  | "patch"
  | "verify"
  | "pr";

export type StageStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface PipelineStageConfig {
  id: PipelineStageId;
  label: string;
  shortLabel: string;
  description: string;
}

export const PIPELINE_STAGES: PipelineStageConfig[] = [
  {
    id: "ingestion",
    label: "Ingestion",
    shortLabel: "INGESTION",
    description: "Perimeter check, git clone & AST grammar loading",
  },
  {
    id: "scanning",
    label: "Scanning",
    shortLabel: "SCANNING",
    description: "Semgrep, Bandit & Gitleaks parallel static audit",
  },
  {
    id: "context",
    label: "Context",
    shortLabel: "CONTEXT",
    description: "Tree-sitter enclosing scope & dependency chunks",
  },
  {
    id: "triage",
    label: "Triage",
    shortLabel: "TRIAGE",
    description: "LLM vulnerability validation & false-positive filter",
  },
  {
    id: "patch",
    label: "Patch",
    shortLabel: "PATCH",
    description: "Minimal deterministic remediation synthesis",
  },
  {
    id: "verify",
    label: "Verification",
    shortLabel: "VERIFICATION",
    description: "Isolated sandbox test suite & re-scan verification",
  },
  {
    id: "pr",
    label: "Pull Request",
    shortLabel: "PR",
    description: "Branch creation, unified diff & pull request agent",
  },
];
