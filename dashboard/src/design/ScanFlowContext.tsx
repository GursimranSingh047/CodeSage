import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Database, Radar, FileCode, Shield, Wrench, Check, GitPullRequest, UserCheck } from "lucide-react";
import { useScanSimulation } from "./useScanSimulation";
import { useScanSession, fileOf } from "../session/ScanSessionContext.jsx";
import type { Agent, AgentId, Finding, ScanRunState, Severity } from "./types";

type FlowPhase = "input" | "running" | "paused" | "completed" | "cancelled";

export type ScanOptions = {
  branch?: string;
  scanners?: string[];
  githubToken?: string;
  githubRepo?: string;
};

type ScanFlow = {
  screen: "input" | "pipeline";
  repoUrl: string;
  isDemo: boolean;
  run: ScanRunState;
  flowPhase: FlowPhase;
  startDemo: (repoLabel?: string) => void;
  startUrl: (repoUrl: string, options?: ScanOptions) => Promise<string | null>;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  retryStage: (id: never) => void;
  reset: () => void;
  scanId?: string | null;
};

const ScanFlowContext = createContext<ScanFlow | null>(null);

const AGENT_ORDER: AgentId[] = [
  "ingestion",
  "scanning",
  "context",
  "triage",
  "patch",
  "verify",
  "pr",
];

export function ScanFlowProvider({ children }: { children: React.ReactNode }) {
  const [screen, setScreen] = useState<"input" | "pipeline">("input");
  const [repoUrl, setRepoUrl] = useState("./test-target-repo");
  const [isDemo, setIsDemo] = useState(true);
  const sim = useScanSimulation();
  const session = useScanSession();

  const liveRunState: ScanRunState = useMemo(() => {
    const s = session?.state || {};
    const nodes = s.nodes || {};

    const agents: Record<AgentId, Agent> = {
      ingestion: {
        id: "ingestion",
        name: "Ingestion Agent",
        icon: Database,
        status:
          nodes.ingestion?.state === "active"
            ? "working"
            : nodes.ingestion?.state === "done"
            ? "success"
            : nodes.ingestion?.state === "failed"
            ? "failed"
            : "queued",
        statusText:
          nodes.ingestion?.state === "active"
            ? "Cloning repository & analyzing structure..."
            : nodes.ingestion?.state === "done"
            ? "Repository cloned and indexed"
            : "Waiting",
        latestActivity: s.technologies
          ? `${s.technologies.total_files || 0} files indexed (${s.technologies.primary_language || "multi-lang"})`
          : undefined,
      },
      scanning: {
        id: "scanning",
        name: "Scanning Agent",
        icon: Radar,
        status:
          nodes.scanning?.state === "active"
            ? "working"
            : nodes.scanning?.state === "done"
            ? "success"
            : nodes.scanning?.state === "failed"
            ? "failed"
            : "queued",
        statusText:
          nodes.scanning?.state === "active"
            ? "Running Semgrep, Bandit & Gitleaks scanners..."
            : nodes.scanning?.state === "done"
            ? "Security scanners complete"
            : "Waiting",
        latestActivity: nodes.scanning?.detail || undefined,
      },
      context: {
        id: "context",
        name: "Context Agent",
        icon: FileCode,
        status:
          nodes.context?.state === "active"
            ? "working"
            : nodes.context?.state === "done"
            ? "success"
            : nodes.context?.state === "failed"
            ? "failed"
            : "queued",
        statusText:
          nodes.context?.state === "active"
            ? "Extracting AST & call-graph context..."
            : nodes.context?.state === "done"
            ? "Context window extracted"
            : "Waiting",
      },
      triage: {
        id: "triage",
        name: "Triage Agent",
        icon: Shield,
        status:
          nodes.triage?.state === "active"
            ? "working"
            : nodes.triage?.state === "done"
            ? "success"
            : nodes.triage?.state === "failed"
            ? "failed"
            : "queued",
        statusText:
          nodes.triage?.state === "active"
            ? "Classifying true vs false positives via LLM..."
            : nodes.triage?.state === "done"
            ? "Triage complete"
            : "Waiting",
        latestActivity: s.counts
          ? `${s.counts.confirmed || 0} confirmed · ${s.counts.false_positive || 0} false positives`
          : undefined,
      },
      patch: {
        id: "patch",
        name: "Patch Agent",
        icon: Wrench,
        status:
          nodes.patch?.state === "active"
            ? "working"
            : nodes.patch?.state === "done"
            ? "success"
            : nodes.patch?.state === "failed"
            ? "failed"
            : "queued",
        statusText:
          nodes.patch?.state === "active"
            ? "Synthesizing AST-aware defensive patches..."
            : nodes.patch?.state === "done"
            ? "Patches generated"
            : "Waiting",
      },
      verify: {
        id: "verify",
        name: "Verification Agent",
        icon: Check,
        status:
          nodes.verify?.state === "active"
            ? "working"
            : nodes.verify?.state === "done"
            ? "success"
            : nodes.verify?.state === "failed"
            ? "failed"
            : "queued",
        statusText:
          nodes.verify?.state === "active"
            ? "Testing patches in verification sandbox..."
            : nodes.verify?.state === "done"
            ? "Verification complete"
            : "Waiting",
      },
      pr: {
        id: "pr",
        name: "PR Agent",
        icon: GitPullRequest,
        status:
          nodes.pr?.state === "active"
            ? "working"
            : nodes.pr?.state === "done"
            ? "success"
            : nodes.pr?.state === "failed"
            ? "failed"
            : "queued",
        statusText:
          nodes.pr?.state === "active"
            ? "Creating GitHub pull request..."
            : nodes.pr?.state === "done"
            ? "PR created / export ready"
            : "Waiting",
      },
      human_review: {
        id: "human_review",
        name: "Human Review",
        icon: UserCheck,
        status: nodes.human_review?.state === "review" ? "human_review" : "idle",
        statusText: nodes.human_review?.state === "review" ? "Needs human review" : "Inactive",
      },
    };

    const findings: Finding[] = (s.findings || []).map((f: any, idx: number) => {
      let sev: Severity = "medium";
      const sSev = (f.severity || "").toLowerCase();
      if (sSev === "critical" || sSev === "high" || sSev === "medium" || sSev === "low") {
        sev = sSev as Severity;
      }
      return {
        id: f.finding_id || `F-${idx + 1}`,
        severity: sev,
        title: f.raw_message || f.rule_id || f.finding_id || "Vulnerability detected",
        file: f.file || (f.finding_id ? fileOf(f.finding_id) : "repository"),
        line: f.line || f.line_number || 1,
        confidence: f.confidence || 0.9,
        state: f.status || "Triaged",
        cwe: f.cwe || f.cwe_id || "CWE",
      };
    });

    const events = (s.logs || []).map((l: any, idx: number) => ({
      id: `log-${idx}`,
      ts: new Date(l.ts ? l.ts * 1000 : Date.now()),
      agent: "system" as const,
      agentName: "CodeSage",
      sentence: l.text,
      kind: (l.kind === "ok" ? "findings" : l.kind === "error" ? "warnings" : "workflow") as any,
      tone: (l.kind === "ok" ? "ok" : l.kind === "error" ? "error" : "info") as any,
    }));

    let completedAgents = 0;
    AGENT_ORDER.forEach((id) => {
      if (agents[id]?.status === "success") completedAgents += 1;
    });
    const overallProgress =
      s.runStatus === "complete" ? 1 : Math.min(0.95, completedAgents / AGENT_ORDER.length);

    const totalFiles = s.technologies?.total_files || (nodes.scanning?.state === "done" ? 12 : 0);
    const totalFindings = s.counts?.total || findings.length;

    return {
      id: s.scanId || "LIVE",
      repo: s.repo || repoUrl || "GitHub Repository",
      branch: s.branch || "main",
      commit: s.commitSha ? s.commitSha.slice(0, 7) : "HEAD",
      status: s.runStatus === "complete" ? "completed" : s.runStatus === "failed" ? "failed" : "running",
      startedAt: new Date(),
      elapsedSeconds: 0,
      overallProgress,
      agents,
      metrics: {
        filesAnalyzed: totalFiles,
        filesTotal: totalFiles,
        findings: totalFindings,
        highSeverity: (s.counts?.high || 0) + (s.counts?.critical || 0),
        patchReadiness: s.counts?.verified
          ? s.counts.verified / Math.max(1, s.counts.confirmed || 1)
          : 0,
      },
      events,
      findings,
      repositoryMetadata: s.repositoryMetadata,
      technologies: s.technologies,
      counts: s.counts,
      scanId: s.scanId,
    };
  }, [session?.state, repoUrl]);

  const flowPhase: FlowPhase = isDemo
    ? sim.phase === "completed"
      ? "completed"
      : sim.phase === "paused"
      ? "paused"
      : sim.phase === "cancelled"
      ? "cancelled"
      : screen === "pipeline"
      ? "running"
      : "input"
    : session?.state?.runStatus === "complete"
    ? "completed"
    : session?.state?.runStatus === "failed"
    ? "cancelled"
    : session?.state?.runStatus === "running" || session?.state?.runStatus === "starting"
    ? "running"
    : screen === "pipeline"
    ? "running"
    : "input";

  const startDemo = useCallback(
    (repoLabel = "./test-target-repo") => {
      sim.reset();
      setRepoUrl(repoLabel || "./test-target-repo");
      setIsDemo(true);
      setScreen("pipeline");
    },
    [sim]
  );

  const startUrl = useCallback(
    async (targetUrl: string, options: ScanOptions = {}) => {
      setIsDemo(false);
      setRepoUrl(targetUrl);
      setScreen("pipeline");
      if (session?.start) {
        return await session.start(targetUrl, options);
      }
      return null;
    },
    [session]
  );

  const run = isDemo ? sim.run : liveRunState;

  return (
    <ScanFlowContext.Provider
      value={{
        screen,
        repoUrl,
        isDemo,
        run,
        flowPhase,
        startDemo,
        startUrl,
        pause: sim.pause,
        resume: sim.resume,
        cancel: sim.cancel,
        retryStage: sim.retryStage as (id: never) => void,
        reset: sim.reset,
        scanId: session?.state?.scanId,
      }}
    >
      {children}
    </ScanFlowContext.Provider>
  );
}

export function useScanFlow(): ScanFlow {
  const ctx = useContext(ScanFlowContext);
  if (!ctx) throw new Error("useScanFlow must be used inside ScanFlowProvider");
  return ctx;
}
