/**
 * CodeSage Frontend Type Definitions
 * Exact mirrors of the backend schemas (codesage/schemas.py & codesage/server.py)
 */

export type Severity = "critical" | "high" | "medium" | "low" | "informational";

export type FindingStatus =
  | "discovered"
  | "triaged_real"
  | "false_positive"
  | "triage_failed"
  | "patch_generated"
  | "patch_generation_failed"
  | "verified_pr_opened"
  | "verified_pr_skipped"
  | "verification_failed"
  | "needs_human_review"
  | "pr_failed"
  | "resolved";

export interface MLPrediction {
  category: string;
  confidence: number;
  risk_score: number;
  uncertain?: boolean;
  details?: Record<string, unknown>;
}

export interface Finding {
  id: string;
  finding_id?: string;
  display_id?: string;
  repo_url?: string;
  file_path: string;
  line_number: number;
  cwe_id: string | null;
  severity: Severity;
  tool_source: "semgrep" | "bandit" | "gitleaks";
  raw_message: string;
  code_snippet: string;
  status?: FindingStatus;
  completed_at?: number;
  pr_url?: string;
  branch?: string;
  pr_number?: number;
  title?: string;
  base_branch?: string;
  failure_reason?: string;
  confidence?: number;
  reasoning?: string;
  explanation?: string;
  attempts?: number;
  ml_prediction?: MLPrediction;
}

export interface FindingArtifacts {
  context?: CodeContext;
  triage?: TriageResult;
  patch?: Patch;
  verification?: VerificationResult;
  pr?: {
    pr_url: string;
    pr_number?: number;
    branch?: string;
    base_branch?: string;
    title?: string;
  };
}

export interface CodeContext {
  finding_id: string;
  enclosing_function: string;
  imports: string[];
  related_chunks: string[];
}

export interface TriageResult {
  finding_id: string;
  is_real_vulnerability: boolean;
  confidence: number;
  reasoning: string;
  cwe_confirmed: string;
  exploitability: "low" | "medium" | "high";
}

export interface Patch {
  finding_id: string;
  original_code: string;
  patched_code: string;
  explanation: string;
  attempt_number: number;
}

export interface VerificationResult {
  finding_id: string;
  passed: boolean;
  scan_clean: boolean;
  tests_passed: boolean;
  failure_reason: string | null;
  diff_verified: boolean;
  tests_available?: boolean;
  tests_status?: string;
}

export interface ScanRunSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
  confirmed: number;
  false_positive: number;
  verified: number;
}

export type ScanStatus = "queued" | "running" | "complete" | "failed" | "cancelled";

export interface ScanRun {
  id: string;
  repo_url: string;
  branch?: string | null;
  status: ScanStatus;
  started: number;
  finished?: number | null;
  error?: string | null;
  counts: Record<string, number>;
  summary_metrics: ScanRunSummary;
  completed: Finding[];
  current_finding?: string | null;
  repository_metadata?: Record<string, unknown>;
  technologies?: Record<string, unknown>;
  file_hashes?: Record<string, string>;
}

export interface ScanHistoryItem {
  scan_id: string;
  repo_url: string;
  branch?: string | null;
  status: ScanStatus;
  started: number;
  finished?: number | null;
  counts: Record<string, number>;
  repository_metadata?: Record<string, unknown>;
  technologies?: Record<string, unknown>;
}

export interface RepositoryValidationResult {
  valid: boolean;
  owner?: string;
  repo?: string;
  full_name?: string;
  normalized_url?: string;
  default_branch?: string;
  is_private?: boolean;
  description?: string;
  stars?: number;
  size_kb?: number;
  is_empty?: boolean;
  language?: string;
  error?: string;
}

export interface ScanEvent {
  type:
    | "run_started"
    | "repo_ingested"
    | "findings_discovered"
    | "stage"
    | "retry"
    | "finding_done"
    | "run_complete"
    | "cancelled"
    | "error"
    | "remediation_complete"
    | "verification_result"
    | "pr_created"
    | "heartbeat"
    | (string & {});
  ts?: string;
  repo?: string;
  count?: number;
  stage?: string;
  status?: string;
  finding_id?: string;
  branch?: string;
  cwe_id?: string;
  pr_url?: string;
  confidence?: number;
  reasoning?: string;
  attempt?: number;
  attempts?: number;
  failure_reason?: string;
  detail?: unknown;
  message?: string;
  duration_s?: number;
  counts?: Record<string, number>;
  model?: string;
  verified?: boolean;
  checks?: unknown[];
  reason?: string;
  pr_number?: number;
  elapsed_seconds?: number;
}

export interface ScanRequestPayload {
  repository_url: string;
  branch?: string;
  base_branch?: string;
  github_repo?: string;
  github_token?: string;
  scanners?: string[];
}
