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
  onNavigateToFindings?: () => void;
  onNavigateToPR?: () => void;
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
  onNavigateToFindings,
  onNavigateToPR,
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

  if (!scanId) {
    return (
      <div className="surface-card rounded-2xl p-12 text-center max-w-md mx-auto space-y-4 border border-[#292D2A]">
        <div className="w-12 h-12 rounded-xl bg-[#151716] border border-[#292D2A] flex items-center justify-center text-[#8CFF8C] mx-auto">
          <Layers className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-sans font-bold text-[#F4F5F4]">
          No Active Scan Selected
        </h3>
        <p className="text-xs text-[#A5AAA6] font-sans leading-relaxed">
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
            className="p-3.5 rounded-xl bg-[#FFB84D]/10 border border-[#FFB84D]/30 flex items-center justify-between text-xs font-mono text-[#FFB84D] shadow-sm"
          >
            <div className="flex items-center gap-2.5">
              <WifiOff className="w-4 h-4 text-[#FFB84D] animate-pulse" />
              <span>
                <strong>Live connection interrupted</strong> — Reconnecting to live WebSocket stream...
              </span>
            </div>
            <span className="text-[11px] text-[#FFB84D]/80 hidden sm:inline">
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
            className="inline-flex items-center gap-2 text-xs font-mono text-[#A5AAA6] hover:text-[#8CFF8C] transition-colors group cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>Back to Dashboard</span>
          </button>
        )}

        <div className="flex items-center gap-2">
          <Badge variant="green" size="xs" dot>
            Interactive Orchestrator
          </Badge>
        </div>
      </div>

      {/* 2. Hero Scan Area matching Reference 2 */}
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
          onNavigateToFindings={onNavigateToFindings}
          onNavigateToPR={onNavigateToPR}
          findingsCount={findings.length}
        />
      </motion.div>

      {/* 3. 7-Stage Pipeline Visualizer */}
      <motion.div variants={cardEntrance}>
        <PipelineVisualizer
          currentStageId={currentStageId}
          stageStatuses={stageStatuses}
        />
      </motion.div>

      {/* 4. Live Event Log & Real-Time Findings Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Real-Time Live Terminal */}
        <motion.div variants={cardEntrance} className="lg:col-span-2">
          <LiveEventLog
            events={events}
            isWsConnected={isWsConnected}
            isReconnecting={isReconnecting}
            onNavigateToFindings={onNavigateToFindings}
            onNavigateToPR={onNavigateToPR}
          />
        </motion.div>

        {/* Findings Discovered Live Panel */}
        <motion.div variants={cardEntrance} className="space-y-4">
          <div className="surface-card rounded-2xl p-5 sm:p-6 space-y-4 h-full flex flex-col justify-between border border-[#292D2A]">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-[#292D2A]">
                <h4 className="text-sm font-sans font-bold text-[#F4F5F4] tracking-tight flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#8CFF8C]" />
                  <span>Findings Triage</span>
                </h4>
                <span className="text-xs font-mono text-[#666C68]">
                  {findings.length} item{findings.length === 1 ? "" : "s"}
                </span>
              </div>

              {findings.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <Sparkles className="w-6 h-6 text-[#666C68] mx-auto animate-pulse" />
                  <p className="text-xs text-[#666C68] font-mono">
                    Discovering and triaging codebase findings...
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {findings.map((finding) => (
                    <div
                      key={finding.id}
                      className="p-3 rounded-xl bg-[#151716] border border-[#292D2A] text-xs font-mono space-y-1 hover:border-[#363C38] transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <Badge
                          variant={finding.severity || "medium"}
                          size="xs"
                        >
                          {finding.severity}
                        </Badge>
                        <span className="text-[10px] text-[#666C68]">
                          {finding.status}
                        </span>
                      </div>
                      <div className="text-[#F4F5F4] truncate font-semibold">
                        {finding.cwe_id || "Vulnerability"}
                      </div>
                      <div className="text-[11px] text-[#A5AAA6] truncate flex items-center gap-1">
                        <FileCode className="w-3 h-3 text-[#666C68]" />
                        {finding.file_path}:{finding.line_number}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#292D2A] text-[11px] font-mono text-[#666C68] flex items-center justify-between">
              <span>Automatic sandbox testing</span>
              <span className="text-[#8CFF8C] font-semibold">Isolated</span>
            </div>
          </div>
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
