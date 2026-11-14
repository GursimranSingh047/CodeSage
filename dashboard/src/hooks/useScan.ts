import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "@/api/client";
import { ScanWebSocketClient } from "@/services/websocket";
import { Finding, ScanEvent, ScanStatus } from "@/types";
import { PipelineStageId, StageStatus } from "@/types/pipeline";

const INITIAL_STAGE_STATUSES: Record<PipelineStageId, StageStatus> = {
  ingestion: "pending",
  scanning: "pending",
  context: "pending",
  triage: "pending",
  patch: "pending",
  verify: "pending",
  pr: "pending",
};

const STAGE_ORDER: PipelineStageId[] = [
  "ingestion",
  "scanning",
  "context",
  "triage",
  "patch",
  "verify",
  "pr",
];

export function useScan() {
  const [scanId, setScanId] = useState<string | null>(null);
  const [status, setStatus] = useState<ScanStatus>("queued");
  const [isScanning, setIsScanning] = useState(false);
  const [repoUrl, setRepoUrl] = useState<string>("");
  const [branch, setBranch] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number>(0);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [currentStageId, setCurrentStageId] = useState<PipelineStageId>("ingestion");
  const [stageStatuses, setStageStatuses] = useState<Record<PipelineStageId, StageStatus>>(
    INITIAL_STAGE_STATUSES
  );
  const [events, setEvents] = useState<ScanEvent[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Connection states
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const wsClientRef = useRef<ScanWebSocketClient | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate approximate percentage based on stage progress
  const getProgressPercentage = useCallback(
    (curStage: PipelineStageId, stat: ScanStatus, stages: Record<PipelineStageId, StageStatus>) => {
      if (stat === "complete") return 100;
      if (stat === "failed" || stat === "cancelled") {
        const completedCount = Object.values(stages).filter((s) => s === "completed").length;
        return Math.min(100, Math.round((completedCount / STAGE_ORDER.length) * 100));
      }
      const stageIdx = STAGE_ORDER.indexOf(curStage);
      if (stageIdx === -1) return 10;
      // Weight per stage
      const base = (stageIdx / STAGE_ORDER.length) * 100;
      return Math.min(95, Math.max(10, Math.round(base + 10)));
    },
    []
  );

  const [progressPercent, setProgressPercent] = useState(0);

  // Handle incoming real-time event
  const handleEvent = useCallback((event: ScanEvent) => {
    setEvents((prev) => [...prev, event]);

    if (event.type === "run_started") {
      setStatus("running");
      setIsScanning(true);
      setStageStatuses((prev) => ({
        ...prev,
        ingestion: "running",
      }));
      setCurrentStageId("ingestion");
    } else if (event.type === "repo_ingested") {
      if (event.branch) setBranch(event.branch);
    } else if (event.type === "stage" && event.stage) {
      const stageName = event.stage.toLowerCase() as PipelineStageId;
      if (STAGE_ORDER.includes(stageName)) {
        if (event.status === "active") {
          setCurrentStageId(stageName);
          setStageStatuses((prev) => {
            const next = { ...prev };
            // Mark earlier stages completed
            const currentIdx = STAGE_ORDER.indexOf(stageName);
            STAGE_ORDER.forEach((s, idx) => {
              if (idx < currentIdx && next[s] === "pending") {
                next[s] = "completed";
              }
            });
            next[stageName] = "running";
            return next;
          });
        } else if (event.status === "done") {
          setStageStatuses((prev) => ({
            ...prev,
            [stageName]: "completed",
          }));
        }
      }
    } else if (event.type === "finding_done") {
      // Re-fetch completed findings from backend
      if (scanId) {
        api.getScanFindings(scanId).then((res) => {
          if (res?.completed) {
            setFindings(res.completed);
          }
        }).catch(() => {});
      }
    } else if (event.type === "run_complete") {
      setStatus("complete");
      setIsScanning(false);
      setFinishedAt(Date.now() / 1000);
      setStageStatuses((prev) => {
        const completedAll = { ...prev };
        STAGE_ORDER.forEach((s) => {
          if (completedAll[s] !== "failed") {
            completedAll[s] = "completed";
          }
        });
        return completedAll;
      });
      setProgressPercent(100);
    } else if (event.type === "cancelled") {
      setStatus("cancelled");
      setIsScanning(false);
      setFinishedAt(Date.now() / 1000);
      setStageStatuses((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          const key = k as PipelineStageId;
          if (next[key] === "running") {
            next[key] = "cancelled";
          }
        });
        return next;
      });
    } else if (event.type === "error") {
      setStatus("failed");
      setIsScanning(false);
      setError(event.message || "Pipeline execution failed");
      setFinishedAt(Date.now() / 1000);
      setStageStatuses((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          const key = k as PipelineStageId;
          if (next[key] === "running") {
            next[key] = "failed";
          }
        });
        return next;
      });
    }
  }, [scanId]);

  // Update progress percentage whenever stage or status changes
  useEffect(() => {
    setProgressPercent(getProgressPercentage(currentStageId, status, stageStatuses));
  }, [currentStageId, status, stageStatuses, getProgressPercentage]);

  // Fallback REST polling mechanism if WebSocket connection is lost
  useEffect(() => {
    if (!scanId || !isScanning || isWsConnected) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    // Polling active
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const [statusRes, eventsRes] = await Promise.all([
          api.getScanStatus(scanId),
          api.getScanEvents(scanId),
        ]);

        if (statusRes) {
          setStatus(statusRes.status);
          if (statusRes.branch) setBranch(statusRes.branch);
          if (statusRes.started) setStartedAt(statusRes.started);
          if (statusRes.finished) setFinishedAt(statusRes.finished);

          if (statusRes.status !== "running" && statusRes.status !== "queued") {
            setIsScanning(false);
          }
        }

        if (eventsRes?.events && eventsRes.events.length > events.length) {
          setEvents(eventsRes.events);
          // Apply state from latest events
          const lastStage = [...eventsRes.events]
            .reverse()
            .find((e) => e.type === "stage" && e.stage);
          if (lastStage?.stage && STAGE_ORDER.includes(lastStage.stage.toLowerCase() as PipelineStageId)) {
            setCurrentStageId(lastStage.stage.toLowerCase() as PipelineStageId);
          }
        }
      } catch (err) {
        console.warn("REST polling fallback encountered error:", err);
      }
    }, 1500);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [scanId, isScanning, isWsConnected, events.length]);

  // Start new scan
  const startScan = async (targetRepoUrl: string, targetBranch?: string, scanners?: string[]) => {
    try {
      setError(null);
      setIsScanning(true);
      setStatus("running");
      setRepoUrl(targetRepoUrl);
      setBranch(targetBranch || null);
      setStartedAt(Date.now() / 1000);
      setFinishedAt(null);
      setEvents([]);
      setFindings([]);
      setStageStatuses(INITIAL_STAGE_STATUSES);
      setCurrentStageId("ingestion");
      setProgressPercent(10);

      const res = await api.startScan({
        repository_url: targetRepoUrl,
        branch: targetBranch,
        scanners: scanners || ["semgrep", "bandit", "gitleaks"],
      });

      const newScanId = res.scan_id;
      setScanId(newScanId);

      // Disconnect prior WebSocket
      if (wsClientRef.current) {
        wsClientRef.current.disconnect();
      }

      // Establish WebSocket connection
      const wsClient = new ScanWebSocketClient(newScanId);
      wsClientRef.current = wsClient;

      wsClient.onConnectionChange((connected) => {
        setIsWsConnected(connected);
        setIsReconnecting(!connected && isScanning);
      });

      wsClient.subscribe(handleEvent);
      wsClient.connect();

      return newScanId;
    } catch (err: unknown) {
      setIsScanning(false);
      setStatus("failed");
      const msg = err instanceof Error ? err.message : "Failed to start scan";
      setError(msg);
      throw err;
    }
  };

  // Load and hydrate an existing scan
  const loadScan = async (id: string) => {
    try {
      setScanId(id);
      setError(null);

      const [statusRes, findingsRes, eventsRes] = await Promise.all([
        api.getScanStatus(id),
        api.getScanFindings(id),
        api.getScanEvents(id),
      ]);

      setRepoUrl(statusRes.repo_url || "");
      setBranch(statusRes.branch || null);
      setStatus(statusRes.status);
      setStartedAt(statusRes.started || 0);
      setFinishedAt(statusRes.finished || null);
      setIsScanning(statusRes.status === "running" || statusRes.status === "queued");

      if (findingsRes?.completed) {
        setFindings(findingsRes.completed);
      }

      if (eventsRes?.events) {
        setEvents(eventsRes.events);
      }

      // If finished, set appropriate stage statuses
      if (statusRes.status === "complete") {
        setStageStatuses({
          ingestion: "completed",
          scanning: "completed",
          context: "completed",
          triage: "completed",
          patch: "completed",
          verify: "completed",
          pr: "completed",
        });
        setCurrentStageId("pr");
        setProgressPercent(100);
      } else if (statusRes.status === "cancelled") {
        setStageStatuses({
          ingestion: "completed",
          scanning: "completed",
          context: "cancelled",
          triage: "pending",
          patch: "pending",
          verify: "pending",
          pr: "pending",
        });
      } else if (statusRes.status === "running") {
        // Connect WebSocket if currently active
        if (wsClientRef.current) {
          wsClientRef.current.disconnect();
        }
        const wsClient = new ScanWebSocketClient(id);
        wsClientRef.current = wsClient;
        wsClient.onConnectionChange((connected) => {
          setIsWsConnected(connected);
          setIsReconnecting(!connected);
        });
        wsClient.subscribe(handleEvent);
        wsClient.connect();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load scan run";
      setError(msg);
    }
  };

  // Request cancellation
  const cancelScan = async () => {
    if (!scanId) return;
    try {
      setIsCancelling(true);
      await api.cancelScan(scanId);
      setStatus("cancelled");
      setIsScanning(false);
      setFinishedAt(Date.now() / 1000);
    } catch (err: unknown) {
      console.error("Cancellation error:", err);
      setError(err instanceof Error ? err.message : "Failed to cancel scan");
    } finally {
      setIsCancelling(false);
    }
  };

  useEffect(() => {
    return () => {
      if (wsClientRef.current) {
        wsClientRef.current.disconnect();
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  return {
    scanId,
    status,
    isScanning,
    repoUrl,
    branch,
    startedAt,
    finishedAt,
    currentStageId,
    stageStatuses,
    events,
    findings,
    progressPercent,
    error,
    isWsConnected,
    isReconnecting,
    isCancelling,
    startScan,
    loadScan,
    cancelScan,
  };
}
