import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  inline?: boolean;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = "An unexpected error occurred",
  message,
  onRetry,
  inline = false,
  className,
}) => {
  if (inline) {
    return (
      <div
        className={`flex items-start gap-3 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs font-sans ${
          className || ""
        }`}
      >
        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-semibold text-rose-200">{title}</div>
          <div className="text-rose-300/90 text-[11px] mt-0.5 font-mono">{message}</div>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-[11px] font-mono underline hover:text-white transition-colors shrink-0"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <Card className={`p-8 text-center flex flex-col items-center justify-center border-rose-500/20 ${className || ""}`}>
      <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400 mb-4 shadow-sm">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <h3 className="font-sans font-semibold text-white text-base mb-1.5">{title}</h3>
      <p className="font-mono text-xs text-rose-300/80 max-w-md leading-relaxed mb-6 bg-sage-900/80 p-3 rounded-lg border border-white/[0.06]">
        {message}
      </p>
      {onRetry && (
        <Button variant="danger" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={onRetry}>
          Retry Operation
        </Button>
      )}
    </Card>
  );
};
