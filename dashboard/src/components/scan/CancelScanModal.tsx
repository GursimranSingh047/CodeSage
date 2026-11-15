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
          className="fixed inset-0 bg-[#080909]/80 backdrop-blur-sm"
        />

        {/* Modal Dialog Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-md surface-card rounded-2xl p-6 sm:p-7 border border-[#292D2A] shadow-elevated z-10 space-y-5"
        >
          {/* Close corner icon */}
          <button
            type="button"
            onClick={onClose}
            disabled={isCancelling}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-[#666C68] hover:text-[#F4F5F4] hover:bg-[#151716] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Alert Header Icon & Title */}
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#FF5555]/10 border border-[#FF5555]/20 flex items-center justify-center text-[#FF5555] shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-sans font-bold text-[#F4F5F4] tracking-tight">
                Cancel this scan?
              </h3>
              <p className="text-xs text-[#A5AAA6] font-sans leading-relaxed">
                CodeSage will stop processing new findings. Temporary resources will be cleaned safely.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#151716] border border-[#292D2A] text-xs font-mono text-[#F4F5F4] leading-relaxed">
            <div className="text-[11px] text-[#8CFF8C] font-semibold uppercase mb-1">
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
              className="text-xs font-sans font-semibold"
            >
              Cancel Scan
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
