import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { connectEvents, fetchArtifacts, startScan } from "../api.js";

// Seeded-target friendly labels: V1..V8 where the file matches the planted
// vulnerability map (VULNERABILITIES.md); generic file:line chips otherwise.
const V_LABELS = {
  "shop.py": "V1", "payments.py": "V2", "auth.py": "V3", "tasks.py": "V4",
  "files.py": "V5", "admin.py": "V6", "main.py": "V7", "requirements.txt": "V8",
};

export const fileOf = (findingId) => String(findingId || "").split(":")[1] || "";
export const labelOf = (findingId) =>
  V_LABELS[fileOf(findingId)] ||
  (fileOf(findingId) ? `${fileOf(findingId)}:${String(findingId).split(":")[2]}` : findingId);

const shortId = (findingId) => {
  if (!findingId) return "";
  const parts = String(findingId).split(":");
  return parts.length >= 4 ? `${parts[1]}:${parts[2]}` : findingId;
};

const logLine = (event) => {
  const f = shortId(event.finding_id);
  switch (event.type) {
    case "run_started":
      return { text: `▶ Scan started — ${event.repo}`, kind: "info" };
    case "findings_discovered":
      return { text: `Scanners surfaced ${event.count} findings`, kind: "info" };
    case "stage":
      if (event.status === "active")
        return { text: `${event.stage} agent: working${f ? ` on ${f}` : ""}...`, kind: "active" };
      return { text: `${event.stage} agent: finished${f ? ` ${f}` : ""}`, kind: "done" };
    case "retry":
      return {
        text: `↩ Verify failed for ${f} — routing back to Patch (attempt ${event.attempt}): ${event.failure_reason || ""}`,
        kind: "retry",
      };
    case "finding_done": {
      const map = {
        verified_pr_opened: { text: `✓ ${f}: PR opened ${event.pr_url}`, kind: "ok" },
        verified_pr_skipped: { text: `✓ ${f}: verified (PR target not configured)`, kind: "ok" },
        needs_human_review: { text: `⚑ ${f}: needs human review — ${event.failure_reason || ""}`, kind: "review" },
        false_positive: { text: `– ${f}: triaged false positive (confidence ${Math.round((event.confidence || 0) * 100)}%)`, kind: "info" },
        triage_failed: { text: `✗ ${f}: triage failed — ${event.failure_reason || ""}`, kind: "error" },
        patch_generation_failed: { text: `✗ ${f}: patch generation failed`, kind: "error" },
        pr_failed: { text: `✗ ${f}: PR failed — ${event.failure_reason || ""}`, kind: "error" },
      };
      return map[event.status] || { text: `${f}: ${event.status}`, kind: "info" };
    }
    case "run_complete":
      return { text: `■ Run complete in ${event.duration_s}s — ${JSON.stringify(event.counts)}`, kind: "ok" };
    case "error":
      return { text: `✗ Pipeline error: ${event.message}`, kind: "error" };
    default:
      return null;
  }
};

const emptyNodes = () =>
  Object.fromEntries(
    ["ingestion", "scanning", "context", "triage", "patch", "verify", "pr", "human_review"].map(
      (n) => [n, { state: "idle", findingId: null, detail: null }]
    )
  );

const initialState = {
  scanId: null,
  runStatus: "idle",
  nodes: emptyNodes(),
  particles: {},
  avatars: {},      // finding_id -> {label, stage, status, attempts}
  logs: [],
  findings: [],
  prs: [],
  counts: {},
  currentFindingId: null,
  lastDone: null,
  artifacts: {},
  runError: null,
};

// Pure event reducer: folds one WS event into dashboard state.
export function reduceEvent(state, event) {
  const next = { ...state, logs: [...state.logs] };
  const line = logLine(event);
  if (line) next.logs.push({ ts: event.ts, ...line });

  const resetRunVisuals = () => {
    next.nodes = emptyNodes();
    next.particles = {};
    next.avatars = {};
    next.currentFindingId = null;
    next.lastDone = null;
  };

  const setAvatar = (findingId, fields) => {
    const label = labelOf(findingId);
    const prev = next.avatars[findingId] || { label, stage: null, status: null, attempts: null };
    next.avatars = {
      ...next.avatars,
      [findingId]: { ...prev, label, ...fields },
    };
  };

  switch (event.type) {
    case "run_started":
      next.runStatus = "running";
      next.findings = [];
      next.prs = [];
      next.counts = {};
      next.selectedFindingId = null;
      resetRunVisuals();
      break;

    case "stage": {
      const node = event.stage;
      const nodes = { ...state.nodes };
      const isNewFinding = event.finding_id && event.finding_id !== state.currentFindingId;
      if (event.status === "active") {
        if (isNewFinding) resetRunVisuals();
        nodes[node] = {
          state: "active",
          findingId: event.finding_id,
          detail: nodes[node]?.detail || null,
        };
        next.nodes = nodes;
        next.currentFindingId = event.finding_id || state.currentFindingId;
        if (event.finding_id) setAvatar(event.finding_id, { stage: node });
        if (state.lastDone && state.lastDone.findingId === event.finding_id) {
          const key = `${state.lastDone.node}->${node}`;
          next.particles = { ...state.particles, [key]: (state.particles[key] || 0) + 1 };
          next.lastDone = null;
        }
      } else {
        nodes[node] = {
          state: "done",
          findingId: event.finding_id || nodes[node]?.findingId || null,
          detail: event.detail ?? nodes[node]?.detail ?? null,
        };
        next.nodes = nodes;
        if (event.finding_id) {
          next.lastDone = { node, findingId: event.finding_id };
          setAvatar(event.finding_id, { stage: node });
        }
      }
      break;
    }

    case "retry": {
      const nodes = { ...state.nodes };
      nodes.verify = { ...nodes.verify, state: "failed" };
      nodes.patch = { ...nodes.patch, state: "active" };
      next.nodes = nodes;
      next.particles = {
        ...state.particles,
        "verify->patch:retry": (state.particles["verify->patch:retry"] || 0) + 1,
      };
      setAvatar(event.finding_id, { stage: "patch", status: "retrying" });
      next.lastDone = null;
      break;
    }

    case "finding_done": {
      const findings = state.findings.filter((f) => f.finding_id !== event.finding_id);
      findings.push({ ...event, cwe: event.cwe_id ?? null });
      next.findings = findings;
      const nodes = { ...state.nodes };
      if (event.status.startsWith("verified")) {
        nodes.pr = { ...nodes.pr, state: "done" };
        nodes.verify = { ...nodes.verify, state: "done" };
      } else if (event.status === "needs_human_review") {
        nodes.human_review = { ...nodes.human_review, state: "review" };
        nodes.verify = { ...nodes.verify, state: "failed" };
      } else if (event.status === "false_positive") {
        nodes.triage = { ...nodes.triage, state: "done" };
      } else {
        nodes.patch = { ...nodes.patch, state: "failed" };
      }
      next.nodes = nodes;
      setAvatar(event.finding_id, { status: event.status, attempts: event.attempts ?? null });
      next.currentFindingId = null;
      next.lastDone = null;
      if (event.pr_url) {
        next.prs = [...state.prs.filter((p) => p.finding_id !== event.finding_id), { ...event }];
      }
      break;
    }

    case "run_complete":
      next.runStatus = "complete";
      next.counts = event.counts || {};
      break;

    case "error":
      next.runStatus = "failed";
      next.runError = event.message;
      break;

    default:
      break;
  }
  return next;
}

const ScanSessionContext = createContext(null);

export function ScanSessionProvider({ children }) {
  const [state, setState] = useState(initialState);
  const closeWs = useRef(null);
  const scanIdRef = useRef(null);

  const handleEvent = useCallback((event) => {
    setState((prev) => reduceEvent(prev, event));
    if (event.type === "run_complete") {
      const total = Object.values(event.counts || {}).reduce((a, b) => a + b, 0);
      toast.success(`Scan complete — ${total} findings processed`, { id: "run" });
    } else if (event.type === "error") {
      toast.error(`Pipeline error: ${event.message}`, { id: "run-error" });
    }
  }, []);

  const start = useCallback(
    async (repoUrl, githubRepo) => {
      if (closeWs.current) closeWs.current();
      setState({ ...initialState, runStatus: "starting" });
      try {
        const { scan_id } = await startScan(repoUrl, githubRepo);
        scanIdRef.current = scan_id;
        setState((prev) => ({ ...prev, scanId: scan_id }));
        closeWs.current = connectEvents(scan_id, handleEvent, null, () => {
          setState((prev) => ({ ...prev, runStatus: "disconnected" }));
        });
        toast.success("Scan started", { id: "run-start" });
        return scan_id;
      } catch (err) {
        setState({ ...initialState, runStatus: "failed", runError: err.message });
        toast.error(err.message, { id: "run-start-error" });
        return null;
      }
    },
    [handleEvent]
  );

  const resume = useCallback(
    (scanId) => {
      // deep-link/resume: reconnect the WS to an existing scan and replay it
      if (closeWs.current) closeWs.current();
      scanIdRef.current = scanId;
      setState((prev) => ({ ...prev, scanId }));
      closeWs.current = connectEvents(scanId, handleEvent, null, () => {
        setState((prev) => ({ ...prev, runStatus: "disconnected" }));
      });
    },
    [handleEvent]
  );

  const loadArtifacts = useCallback(async (findingId) => {
    if (!scanIdRef.current) return null;
    const artifacts = await fetchArtifacts(scanIdRef.current, findingId);
    if (artifacts) {
      setState((prev) => ({
        ...prev,
        artifacts: { ...prev.artifacts, [findingId]: artifacts },
      }));
    }
    return artifacts;
  }, []);

  const attach = useCallback((scanId) => {
    // deep-link to a past/current scan: fetch findings, no live WS
    scanIdRef.current = scanId;
    setState((prev) => ({ ...prev, scanId, runStatus: prev.runStatus }));
  }, []);

  useEffect(() => () => closeWs.current && closeWs.current(), []);

  return (
    <ScanSessionContext.Provider value={{ state, start, resume, loadArtifacts, attach }}>
      {children}
    </ScanSessionContext.Provider>
  );
}

export const useScanSession = () => useContext(ScanSessionContext);
