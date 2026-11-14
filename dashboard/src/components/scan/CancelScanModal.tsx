import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, StopCircle, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface CancelScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  isCancelling?: boolean;
}

export const CancelScanModal: React.FC<CancelScanModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isCancelling = false,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm"
        />

        {/* Modal Dialog Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-md glass-panel-elevated rounded-2xl p-6 sm:p-7 border border-rose-500/30 shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-10 space-y-5"
        >
          {/* Close corner icon */}
          <button
            type="button"
            onClick={onClose}
            disabled={isCancelling}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-sage-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Alert Header Icon & Title */}
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0 shadow-[0_0_12px_rgba(244,63,94,0.2)]">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-sans font-bold text-white tracking-tight">
                Cancel this scan?
              </h3>
              <p className="text-xs text-sage-400 font-sans leading-relaxed">
                CodeSage will stop processing new findings. Temporary resources will be cleaned safely.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-sage-900/80 border border-white/[0.06] text-xs font-mono text-sage-300 leading-relaxed">
            <div className="text-[11px] text-accent-orange font-semibold uppercase mb-1">
              Guaranteed Behavior
            </div>
            Completed findings, artifacts, and verification traces generated up to this moment are preserved in persistent history.
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isCancelling}
              className="text-xs font-sans"
            >
              Continue Scanning
            </Button>

            <Button
              variant="danger"
              size="sm"
              onClick={onConfirm}
              loading={isCancelling}
              icon={<StopCircle className="w-4 h-4" />}
              className="text-xs font-sans font-semibold shadow-[0_0_12px_rgba(244,63,94,0.3)]"
            >
              Cancel Scan
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
