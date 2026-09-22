import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Database, Radar, FileCode, Shield, Wrench, Check, GitPullRequest, UserCheck } from "lucide-react";
import {
  AGENT_ORDER,
  Agent,
  AgentId,
  ActivityEvent,
  Finding,
  ScanRunState,
  STAGE_DURATIONS,
  formatClock,
} from "./types";

type Tick = {
  elapsed: number;
  stageElapsed: number;
  scanningProgress: number; // 0..1
  filesAnalyzed: number;
};

const AGENT_META: Record<AgentId, { name: string; icon: typeof Database }> = {
  ingestion: { name: "Ingestion", icon: Database },
  scanning: { name: "Scanning", icon: Radar },
  context: { name: "Context", icon: FileCode },
  triage: { name: "Triage", icon: Shield },
  patch: { name: "Patch", icon: Wrench },
  verify: { name: "Verify", icon: Check },
  pr: { name: "Pull Request", icon: GitPullRequest },
  human_review: { name: "Human Review", icon: UserCheck },
};

const FILES_TOTAL = 1_248;
const SCAN_START_FILES = 847; // snapshot begins mid-scan, per the brief
const SCAN_STARTED_AT = new Date(Date.now() - 158_000); // "running for 02:38"

const FILES_BEFORE = [
  "src/recommendation.ts",
  "src/api/catalog.ts",
  "src/auth/session.ts",
  "package.json",
  "src/utils/http.ts",
  "src/models/user.ts",
  "src/db/pool.ts",
  "src/api/webhooks.ts",
];

function agent(
  id: AgentId,
  status: Agent["status"],
  statusText: string,
  extra: Partial<Agent> = {}
): Agent {
  return { id, name: AGENT_META[id].name, icon: AGENT_META[id].icon, status, statusText, ...extra };
}

function evt(
  agent: AgentId | "system",
  agentName: string,
  sentence: string,
  kind: ActivityEvent["kind"],
  at: Date,
  tone?: ActivityEvent["tone"],
  fileRef?: string
): ActivityEvent {
  return {
    id: `${at.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    ts: at,
    agent,
    agentName,
    sentence,
    fileRef,
    kind,
    tone,
  };
}

function initialAgents(): Record<AgentId, Agent> {
  return {
    ingestion: agent("ingestion", "success", "Complete", {
      duration: "14s",
      filesCount: FILES_TOTAL,
      latestActivity: "1,248 files indexed",
      count: "86k LOC",
    }),
    scanning: agent("scanning", "working", "Analyzing dependency graph", {
      progress: SCAN_START_FILES / FILES_TOTAL,
      latestActivity: `Scanning ${SCAN_START_FILES.toLocaleString()} of ${FILES_TOTAL.toLocaleString()} files`,
    }),
    context: agent("context", "queued", "Queued"),
    triage: agent("triage", "queued", "Queued"),
    patch: agent("patch", "queued", "Waiting for approved findings"),
    verify: agent("verify", "queued", "Waiting"),
    pr: agent("pr", "queued", "Waiting"),
    human_review: agent("human_review", "idle", "Inactive"),
  };
}

function initialEvents(): ActivityEvent[] {
  const t0 = SCAN_STARTED_AT.getTime();
  const at = (offset: number) => new Date(t0 + offset);
  return [
    evt("system", "Scan", `Scan #CS-1048 queued for shopfast-api@main`, "workflow", at(0)),
    evt("ingestion", "Ingestion", "Cloned repository — default branch main @ 3d5e0d2", "workflow", at(4_000), "ok"),
    evt("ingestion", "Ingestion", `Indexed ${FILES_TOTAL.toLocaleString()} files, 86k LOC`, "workflow", at(9_500), "ok"),
    evt("scanning", "Scanning", "Semgrep ruleset loaded (6 rules) · Bandit · Gitleaks", "workflow", at(12_000)),
    evt("scanning", "Scanning", "Identified 3 vulnerable dependencies", "warnings", at(38_000), "warn", "package.json"),
    evt("scanning", "Scanning", "Matched SQL injection pattern in recommendation query", "findings", at(64_000), "warn", "src/recommendation.ts"),
  ];
}

const INITIAL_FINDINGS: Finding[] = [
  {
    id: "F-1041",
    severity: "high",
    title: "Unsanitized input in recommendation query",
    file: "src/api/recommendations.ts",
    line: 84,
    cwe: "CWE-89",
    confidence: 0.94,
    state: "Awaiting triage",
  },
  {
    id: "F-1042",
    severity: "medium",
    title: "Hardcoded credential in test fixture",
    file: "src/config/defaults.ts",
    line: 12,
    cwe: "CWE-798",
    confidence: 0.88,
    state: "Awaiting triage",
  },
  {
    id: "F-1043",
    severity: "low",
    title: "Outdated dependency: left-pad 1.3.0",
    file: "package.json",
    line: 41,
    cwe: "CWE-1104",
    confidence: 0.76,
    state: "Queued for triage",
  },
];

type Phase = "running" | "paused" | "completed" | "cancelled" | "failed";

export function useScanSimulation() {
  const [phase, setPhase] = useState<Phase>("running");
  const [elapsed, setElapsed] = useState(158); // "Running for 02:38" — total wall clock
  const [stageElapsed, setStageElapsed] = useState(0); // fresh clock for the stage schedule
  const [events, setEvents] = useState<ActivityEvent[]>(initialEvents);
  const [findings, setFindings] = useState<Finding[]>(INITIAL_FINDINGS);
  const [filesAnalyzed, setFilesAnalyzed] = useState(SCAN_START_FILES);
  const [currentFile, setCurrentFile] = useState("src/recommendation.ts");
  const [highSeverity, setHighSeverity] = useState(2);
  const [agents, setAgents] = useState<Record<AgentId, Agent>>(initialAgents);
  const firedRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<Array<() => void>>([]);

  const pushEvent = useCallback((event: ActivityEvent) => {
    setEvents((prev) => [...prev, event]);
  }, []);

  const setAgent = useCallback((id: AgentId, patch: Partial<Agent>) => {
    setAgents((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const once = useCallback((key: string, fn: () => void) => {
    if (firedRef.current.has(key)) return;
    firedRef.current.add(key);
    fn();
  }, []);

  // main tick — 250ms simulation heartbeat
  useEffect(() => {
    if (phase !== "running") return;
    const timer = window.setInterval(() => {
      setElapsed((e) => e + 0.25);
      setStageElapsed((s) => s + 250);
    }, 250);
    return () => window.clearInterval(timer);
  }, [phase]);

  // the run snapshot begins mid-scan at 847 of 1,248 files (per the brief)
  const scanningProgress = Math.min(1, stageElapsed / STAGE_DURATIONS.scanning);
  const currentFiles = Math.round(SCAN_START_FILES + (FILES_TOTAL - SCAN_START_FILES) * scanningProgress);

  // drive the scanning stage
  useEffect(() => {
    if (phase !== "running") return;
    setFilesAnalyzed(currentFiles);
    setAgent("scanning", {
      progress: scanningProgress,
      latestActivity: `Scanning ${currentFiles.toLocaleString()} of ${FILES_TOTAL.toLocaleString()} files`,
    });
    if (Math.floor(stageElapsed / 2_200) !== Math.floor((stageElapsed - 250) / 2_200)) {
      const file = FILES_BEFORE[Math.floor(Math.random() * FILES_BEFORE.length)];
      setCurrentFile(file);
      setAgent("scanning", { latestActivity: `Analyzing ${file}` });
    }
  }, [phase, scanningProgress, currentFiles, stageElapsed, setAgent, once, pushEvent, currentFile]);

  // stage advancement
  const stageIndex = useMemo(() => {
    const order: AgentId[] = ["scanning", "context", "triage", "patch", "verify", "pr"];
    let acc = 0;
    for (let i = 0; i < order.length; i++) {
      acc += STAGE_DURATIONS[order[i]];
      if (stageElapsed < acc) return { id: order[i], index: i, stageElapsed };
    }
    return { id: null, index: order.length, stageElapsed };
  }, [stageElapsed]);

  useEffect(() => {
    if (phase !== "running") return;
    const stage = stageIndex.id;
    if (stage === null) {
      // every stage finished
      if (phase === "running") {
        setPhase("completed");
        pushEvent(evt("system", "Scan", "Scan #CS-1048 completed — PR #48 awaiting your review", "workflow", new Date(), "ok"));
      }
      return;
    }
    if (stage === "scanning") {
      if (scanningProgress >= 1) {
        once("scan-done", () => {
          setFilesAnalyzed(FILES_TOTAL);
          setAgent("scanning", {
            status: "success",
            statusText: "Complete",
            progress: 1,
            duration: formatClock(STAGE_DURATIONS.scanning / 1000),
            latestActivity: `${FILES_TOTAL.toLocaleString()} files · 47 patterns evaluated`,
            count: "47 patterns",
          });
          setAgent("context", { status: "working", statusText: "Mapping data flow", progress: 0.05 });
          pushEvent(evt("scanning", "Scanning", `Scan complete — ${FILES_TOTAL.toLocaleString()} files, 6 findings`, "workflow", new Date(), "ok"));
          pushEvent(evt("context", "Context", "Building call graph for 6 findings", "workflow", new Date()));
          setHighSeverity(3);
        });
      } else {
        setAgent("scanning", {
          status: "working",
          statusText: "Working",
          progress: scanningProgress,
        });
      }
      return;
    }

    const stageP = Math.min(1, stageElapsed / STAGE_DURATIONS[stage]);
    switch (stage) {
      case "context":
        once("ctx-start", () => {
          setAgent("context", { status: "working", statusText: "Mapping data flow", progress: 0.05 });
          pushEvent(evt("context", "Context", "Mapping data flow in src/api/recommendations.ts", "workflow", new Date(), undefined, "src/api/recommendations.ts"));
        });
        if (stageP > 0.5)
          once("ctx-half", () =>
            pushEvent(evt("context", "Context", "Enclosing functions resolved for 6 findings", "workflow", new Date(), "ok"))
          );
        setAgent("context", { progress: stageP });
        if (stageP >= 1)
          once("ctx-done", () => {
            setAgent("context", { status: "success", statusText: "Complete", progress: 1, duration: "7s", latestActivity: "6 functions mapped" });
            setAgent("triage", { status: "working", statusText: "Classifying findings", progress: 0.05 });
            pushEvent(evt("triage", "Triage", "Reviewing 6 findings with surrounding context", "workflow", new Date()));
          });
        break;

      case "triage":
        once("tri-start", () => setAgent("triage", { status: "working", statusText: "Classifying findings", progress: 0.05 }));
        if (stageP > 0.4)
          once("tri-fp", () => {
            pushEvent(evt("triage", "Triage", "Marked app.py:278 as likely false positive", "findings", new Date(), undefined, "app.py:278"));
            setFindings((prev) => prev.map((f) => (f.id === "F-1043" ? { ...f, state: "Triaged — false positive" } : f)));
          });
        if (stageP > 0.7)
          once("tri-real", () => {
            pushEvent(evt("triage", "Triage", "Confirmed SQL injection in src/api/recommendations.ts:84 (94%)", "findings", new Date(), "warn", "src/api/recommendations.ts:84"));
            setFindings((prev) => prev.map((f) => (f.id === "F-1041" ? { ...f, state: "Confirmed — patching" } : f)));
          });
        setAgent("triage", { progress: stageP });
        if (stageP >= 1)
          once("tri-done", () => {
            setAgent("triage", { status: "success", statusText: "Complete", progress: 1, duration: "9s", latestActivity: "6 triaged · 4 real · 2 false positives", count: "4 to patch" });
            setAgent("patch", { status: "working", statusText: "Drafting fixes for 4 findings", progress: 0.05 });
            pushEvent(evt("patch", "Patch", "Drafting fixes for 4 confirmed findings", "workflow", new Date()));
          });
        break;

      case "patch":
        once("pat-start", () => setAgent("patch", { status: "working", statusText: "Drafting fixes", progress: 0.05 }));
        if (stageP > 0.5)
          once("pat-half", () => {
            pushEvent(evt("patch", "Patch", "Parameterized query drafted for src/api/recommendations.ts:84", "findings", new Date(), "ok", "src/api/recommendations.ts:84"));
            setFindings((prev) => prev.map((f) => (f.id === "F-1041" ? { ...f, state: "Patch drafted" } : f)));
          });
        setAgent("patch", { progress: stageP });
        if (stageP >= 1)
          once("pat-done", () => {
            setAgent("patch", { status: "success", statusText: "Complete", progress: 1, duration: "9s", latestActivity: "4 patches drafted", count: "4 patches" });
            setAgent("verify", { status: "working", statusText: "Running sandbox verification", progress: 0.05 });
            pushEvent(evt("verify", "Verify", "Applied 4 patches in isolated sandbox — re-running scanners and tests", "workflow", new Date()));
          });
        break;

      case "verify":
        once("ver-start", () => setAgent("verify", { status: "working", statusText: "Sandbox verification", progress: 0.05 }));
        if (stageP > 0.6)
          once("ver-half", () =>
            pushEvent(evt("verify", "Verify", "Re-scan clean · test suite green for 4/4 patches", "workflow", new Date(), "ok"))
          );
        setAgent("verify", { progress: stageP });
        if (stageP >= 1)
          once("ver-done", () => {
            setAgent("verify", { status: "success", statusText: "Complete", progress: 1, duration: "9s", latestActivity: "4/4 patches verified", count: "4/4 verified" });
            setAgent("pr", { status: "working", statusText: "Opening pull request", progress: 0.1 });
            pushEvent(evt("pr", "Pull Request", "Opening PR #48 — 'Fix 4 verified vulnerabilities (CodeSage)'", "workflow", new Date()));
          });
        break;

      case "pr":
        once("pr-start", () => setAgent("pr", { status: "working", statusText: "Opening pull request", progress: 0.2 }));
        if (stageP > 0.6)
          once("pr-half", () =>
            setFindings((prev) => prev.map((f) => (f.state === "Patch drafted" ? { ...f, state: "PR opened" } : f)))
          );
        setAgent("pr", { progress: stageP });
        if (stageP >= 1)
          once("pr-done", () => {
            setAgent("pr", { status: "success", statusText: "PR #48 opened", progress: 1, duration: "5s", latestActivity: "Awaiting human review on GitHub" });
            pushEvent(evt("pr", "Pull Request", "PR #48 ready for review — 4 verified fixes", "workflow", new Date(), "ok"));
          });
        break;

    }
  }, [phase, stageIndex, stageElapsed, scanningProgress, setAgent, once, pushEvent]);

  const overallProgress = useMemo(() => {
    const done = AGENT_ORDER.indexOf((stageIndex.id ?? "pr") as AgentId);
    const weights: Record<AgentId, number> = {
      ingestion: 0.08,
      scanning: 0.22,
      context: 0.12,
      triage: 0.16,
      patch: 0.16,
      verify: 0.16,
      pr: 0.1,
      human_review: 0,
    };
    let total = weights.ingestion; // ingestion complete from the start
    AGENT_ORDER.slice(1).forEach((id) => {
      if (AGENT_ORDER.indexOf(id) < done) total += weights[id];
    });
    const activeId = stageIndex.id;
    if (activeId && activeId !== "ingestion") total += weights[activeId] * (stageIndex.id ? Math.min(1, stageElapsed / STAGE_DURATIONS[activeId]) : 0);
    return Math.min(1, total);
  }, [stageIndex, stageElapsed]);

  const pause = useCallback(() => setPhase((p) => (p === "running" ? "paused" : p)), []);
  const resume = useCallback(() => setPhase((p) => (p === "paused" ? "running" : p)), []);
  const cancel = useCallback(() => {
    setPhase("cancelled");
    setAgent("scanning", { status: "failed", statusText: "Cancelled by user" });
    pushEvent(evt("system", "Scan", "Scan cancelled by user", "workflow", new Date(), "error"));
  }, [pushEvent, setAgent]);
  const retryStage = useCallback(
    (id: AgentId) => {
      setPhase("running");
      pushEvent(evt(id, AGENT_META[id].name, "Retry requested — re-running from last checkpoint", "workflow", new Date()));
    },
    [pushEvent]
  );

  const reset = useCallback(() => {
    firedRef.current = new Set();
    setElapsed(158);
    setStageElapsed(0);
    setEvents(initialEvents());
    setFindings(INITIAL_FINDINGS);
    setFilesAnalyzed(SCAN_START_FILES);
    setCurrentFile("src/recommendation.ts");
    setHighSeverity(2);
    setAgents(initialAgents());
    setPhase("running");
  }, []);

  const metrics = {
    filesAnalyzed,
    filesTotal: FILES_TOTAL,
    findings: findings.length + 3,
    highSeverity,
    patchReadiness: agents.patch.status === "success" ? 1 : agents.patch.progress ?? 0,
  };

  const run: ScanRunState = {
    id: "CS-1048",
    repo: "shopfast-api",
    branch: "main",
    commit: "3d5e0d2",
    status: phase,
    startedAt: SCAN_STARTED_AT,
    elapsedSeconds: elapsed,
    overallProgress,
    agents,
    metrics: { ...metrics, findings: Math.max(metrics.findings, Math.round(scanningProgress * 6) + 1) },
    events,
    findings,
  };

  return {
    run,
    currentFile,
    phase,
    pause,
    resume,
    cancel,
    retryStage,
    reset,
    agents: run.agents,
  };
}
