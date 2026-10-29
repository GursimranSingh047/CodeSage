import type { LucideIcon } from "lucide-react";

export type AgentStatus =
  | "idle"
  | "queued"
  | "working"
  | "success"
  | "warning"
  | "failed"
  | "human_review";

export type AgentId =
  | "ingestion"
  | "scanning"
  | "context"
  | "triage"
  | "patch"
  | "verify"
  | "pr"
  | "human_review";

export type Agent = {
  id: AgentId;
  name: string;
  icon: LucideIcon;
  status: AgentStatus;
  statusText: string;
  /** 0..1 — drives the active progress arc */
  progress?: number;
  duration?: string;
  filesCount?: number;
  latestActivity?: string;
  count?: string;
  dependsOn?: AgentId[];
};

export type ActivityKind = "workflow" | "findings" | "warnings";

export type ActivityEvent = {
  id: string;
  ts: Date;
  agent: AgentId | "system";
  agentName: string;
  sentence: string;
  fileRef?: string;
  kind: ActivityKind;
  tone?: "info" | "ok" | "warn" | "error";
};

export type Severity = "critical" | "high" | "medium" | "low";

export type Finding = {
  id: string;
  severity: Severity;
  title: string;
  file: string;
  line: number;
  confidence: number; // 0..1
  state: string; // e.g. "Awaiting triage", "Patch ready"
  cwe?: string | null;
};

export type ScanRunState = {
  id: string;
  repo: string;
  branch: string;
  commit: string;
  status: "running" | "completed" | "paused" | "failed" | "cancelled";
  startedAt: Date;
  elapsedSeconds: number;
  overallProgress: number; // 0..1
  agents: Record<AgentId, Agent>;
  metrics: {
    filesAnalyzed: number;
    filesTotal: number;
    findings: number;
    highSeverity: number;
    patchReadiness: number; // 0..1
  };
  events: ActivityEvent[];
  findings: Finding[];
  repositoryMetadata?: {
    owner?: string;
    repo?: string;
    full_name?: string;
    default_branch?: string;
    description?: string;
    stars?: number;
    forks?: number;
    open_issues?: number;
    private?: boolean;
    html_url?: string;
  };
  technologies?: {
    primary_language?: string;
    languages?: Record<string, number>;
    frameworks?: string[];
    total_files?: number;
    total_size_mb?: number;
  };
  counts?: Record<string, number>;
  scanId?: string;
};

/** Stage schedule for the mock engine (ms per stage). */
export const STAGE_DURATIONS: Record<string, number> = {
  scanning: 26_000,
  context: 7_000,
  triage: 9_000,
  patch: 9_000,
  verify: 9_000,
  pr: 5_000,
};

export const AGENT_ORDER: AgentId[] = [
  "ingestion",
  "scanning",
  "context",
  "triage",
  "patch",
  "verify",
  "pr",
];

export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatTime(ts: Date): string {
  return ts.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
