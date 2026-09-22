import React, { createContext, useCallback, useContext, useState } from "react";
import { useScanSimulation } from "./useScanSimulation";
import type { ScanRunState } from "./types";

type FlowPhase = "input" | "running" | "paused" | "completed" | "cancelled";

type ScanFlow = {
  screen: "input" | "pipeline";
  repoUrl: string;
  isDemo: boolean;
  run: ScanRunState;
  flowPhase: FlowPhase;
  startDemo: (repoLabel?: string) => void;
  startUrl: (repoUrl: string) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  retryStage: (id: never) => void;
  reset: () => void;
};

const ScanFlowContext = createContext<ScanFlow | null>(null);

/**
 * Presentation-layer flow for the notched redesign: owns the simulated scan
 * (useScanSimulation) plus which screen of the Landing → Agents → Results
 * journey is active. The live Module 8 WebSocket feed can replace the
 * simulation later without touching the page components.
 */
export function ScanFlowProvider({ children }: { children: React.ReactNode }) {
  const [screen, setScreen] = useState<"input" | "pipeline">("input");
  const [repoUrl, setRepoUrl] = useState("./test-target-repo");
  const [isDemo, setIsDemo] = useState(true);
  const sim = useScanSimulation();

  const flowPhase: FlowPhase =
    sim.phase === "completed"
      ? "completed"
      : sim.phase === "paused"
      ? "paused"
      : sim.phase === "cancelled"
      ? "cancelled"
      : screen === "pipeline"
      ? "running"
      : "input";

  const begin = useCallback((label: string, demo: boolean) => {
    sim.reset(); // restart the simulated run from the snapshot state
    setRepoUrl(label);
    setIsDemo(demo);
    setScreen("pipeline");
  }, [sim]);

  const startDemo = useCallback(
    (repoLabel = "./test-target-repo") => begin(repoLabel || "./test-target-repo", true),
    [begin]
  );
  const startUrl = useCallback((repoUrl: string) => begin(repoUrl, false), [begin]);

  return (
    <ScanFlowContext.Provider
      value={{
        screen,
        repoUrl,
        isDemo,
        run: sim.run,
        flowPhase,
        startDemo,
        startUrl,
        pause: sim.pause,
        resume: sim.resume,
        cancel: sim.cancel,
        retryStage: sim.retryStage as (id: never) => void,
        reset: sim.reset,
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
