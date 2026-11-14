import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  WifiOff,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  Layers,
  FileCode,
} from "lucide-react";
import { HeroScanArea } from "@/components/scan/HeroScanArea";
import { PipelineVisualizer } from "@/components/scan/PipelineVisualizer";
import { LiveEventLog } from "@/components/scan/LiveEventLog";
import { CancelScanModal } from "@/components/scan/CancelScanModal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Finding, ScanEvent, ScanStatus } from "@/types";
import { PipelineStageId, StageStatus } from "@/types/pipeline";
import { staggerContainer, cardEntrance } from "@/animations/variants";

interface ScanOrchestrationPageProps {
  scanId: string | null;
  repoUrl: string;
  branch?: string | null;
  status: ScanStatus;
  currentStageId: PipelineStageId;
  stageStatuses: Record<PipelineStageId, StageStatus>;
  events: ScanEvent[];
  findings: Finding[];
  progressPercent: number;
  startedAt?: number;
  finishedAt?: number | null;
  isWsConnected: boolean;
  isReconnecting: boolean;
  isCancelling: boolean;
  onCancelScan: () => Promise<void>;
  onBackToDashboard?: () => void;
}

export const ScanOrchestrationPage: React.FC<ScanOrchestrationPageProps> = ({
  scanId,
  repoUrl,
  branch,
  status,
  currentStageId,
  stageStatuses,
  events,
  findings,
  progressPercent,
  startedAt,
  finishedAt,
  isWsConnected,
  isReconnecting,
  isCancelling,
  onCancelScan,
  onBackToDashboard,
}) => {
  const [showCancelModal, setShowCancelModal] = useState(false);

  const handleConfirmCancel = async () => {
    try {
      await onCancelScan();
      setShowCancelModal(false);
    } catch (err) {
      console.error("Cancel failed:", err);
    }
  };

  // If no scan is currently targeted
  if (!scanId) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center max-w-md mx-auto space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-sage-900 border border-white/[0.08] flex items-center justify-center text-sage-400">
          <Layers className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-sans font-semibold text-white">
          No Active Scan Selected
        </h3>
        <p className="text-xs text-sage-400 font-sans leading-relaxed">
          Select an existing audit run from your history or launch a new scan from the command center.
        </p>
        {onBackToDashboard && (
          <Button
            variant="outline"
            size="sm"
            onClick={onBackToDashboard}
            icon={<ArrowLeft className="w-4 h-4" />}
          >
            Return to Dashboard
          </Button>
        )}
      </div>
    );
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6 max-w-7xl mx-auto"
    >
      {/* 1. Connection Interrupted Warning Banner */}
      <AnimatePresence>
        {isReconnecting && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs font-mono text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.15)]"
          >
            <div className="flex items-center gap-2.5">
              <WifiOff className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>
                <strong>Live connection interrupted</strong> — Reconnecting to live WebSocket stream...
              </span>
            </div>
            <span className="text-[11px] text-amber-400/80 hidden sm:inline">
              Falling back to real-time REST polling
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Navigation Row */}
      <div className="flex items-center justify-between">
        {onBackToDashboard && (
          <button
            type="button"
            onClick={onBackToDashboard}
            className="inline-flex items-center gap-2 text-xs font-mono text-sage-400 hover:text-white transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>Back to Dashboard</span>
          </button>
        )}

        <div className="flex items-center gap-2">
          <Badge variant="teal" size="xs" dot>
            Interactive Orchestrator
          </Badge>
        </div>
      </div>

      {/* 2. Hero Scan Area (Circular animated progress, timer, metadata, cancel button) */}
      <motion.div variants={cardEntrance}>
        <HeroScanArea
          repoUrl={repoUrl}
          branch={branch}
          scanId={scanId}
          status={status}
          currentStageId={currentStageId}
          progressPercent={progressPercent}
          startedAt={startedAt}
          finishedAt={finishedAt}
          onCancelRequest={() => setShowCancelModal(true)}
          isCancelling={isCancelling}
        />
      </motion.div>

      {/* 3. 7-Stage Pipeline Visualizer (Ingestion -> Scanning -> Context -> Triage -> Patch -> Verification -> PR) */}
      <motion.div variants={cardEntrance}>
        <PipelineVisualizer
          currentStageId={currentStageId}
          stageStatuses={stageStatuses}
        />
      </motion.div>

      {/* 4. Live Event Log & Real-Time Findings Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Real-Time Live WebSocket Terminal */}
        <motion.div variants={cardEntrance} className="lg:col-span-2">
          <LiveEventLog
            events={events}
            isWsConnected={isWsConnected}
            isReconnecting={isReconnecting}
          />
        </motion.div>

        {/* Findings Discovered Live Panel */}
        <motion.div variants={cardEntrance} className="space-y-4">
          <Card variant="elevated" className="p-5 sm:p-6 space-y-4 h-full flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                <h4 className="text-sm font-sans font-semibold text-white tracking-tight flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-accent-teal" />
                  <span>Findings Triage</span>
                </h4>
                <span className="text-xs font-mono text-sage-400">
                  {findings.length} item{findings.length === 1 ? "" : "s"}
                </span>
              </div>

              {findings.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <Sparkles className="w-6 h-6 text-sage-600 mx-auto animate-pulse" />
                  <p className="text-xs text-sage-500 font-mono">
                    Discovering and triaging codebase findings...
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {findings.map((finding) => (
                    <div
                      key={finding.id}
                      className="p-3 rounded-lg bg-sage-900 border border-white/[0.06] text-xs font-mono space-y-1 hover:border-white/[0.12] transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <Badge
                          variant={finding.severity || "medium"}
                          size="xs"
                        >
                          {finding.severity}
                        </Badge>
                        <span className="text-[10px] text-sage-500">
                          {finding.status}
                        </span>
                      </div>
                      <div className="text-sage-200 truncate font-semibold">
                        {finding.cwe_id || "Vulnerability"}
                      </div>
                      <div className="text-[11px] text-sage-400 truncate flex items-center gap-1">
                        <FileCode className="w-3 h-3 text-sage-500" />
                        {finding.file_path}:{finding.line_number}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-white/[0.06] text-[11px] font-mono text-sage-500 flex items-center justify-between">
              <span>Automatic sandbox testing</span>
              <span className="text-emerald-400">Isolated</span>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* 5. Cancel Scan Confirmation Modal */}
      <CancelScanModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirm={handleConfirmCancel}
        isCancelling={isCancelling}
      />
    </motion.div>
  );
};
