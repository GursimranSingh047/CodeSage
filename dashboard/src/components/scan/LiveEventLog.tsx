import React, { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Terminal,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ScanEvent } from "@/types";
import { clsx } from "clsx";

interface LiveEventLogProps {
  events: ScanEvent[];
  isWsConnected: boolean;
  isReconnecting: boolean;
  onNavigateToFindings?: () => void;
  onNavigateToPR?: () => void;
  className?: string;
}

interface FormattedLine {
  id: string;
  timestamp: string;
  icon: "check" | "warn" | "error" | "arrow";
  text: string;
  type: string;
  raw: ScanEvent;
  actionLabel?: string;
  actionType?: "findings" | "pr";
}

function formatEventToLine(event: ScanEvent, index: number): FormattedLine {
  const ts = event.ts ? event.ts.split("T")[1]?.slice(0, 8) || "00:00:00" : "00:00:00";
  let icon: "check" | "warn" | "error" | "arrow" = "arrow";
  let text = "";
  let actionLabel: string | undefined;
  let actionType: "findings" | "pr" | undefined;

  switch (event.type) {
    case "run_started":
      icon = "arrow";
      text = `Scan initialized on repository: ${event.repo || "target"}`;
      break;

    case "repo_ingested":
      icon = "check";
      text = `Repository cloned & indexed [branch: ${event.branch || "main"}]`;
      break;

    case "findings_discovered":
      icon = "arrow";
      text = `Static discovery completed: ${event.count || 0} potential findings flagged`;
      actionLabel = "View Findings →";
      actionType = "findings";
      break;

    case "stage":
      if (event.status === "active") {
        icon = "arrow";
        text = `Executing stage: ${event.stage?.toUpperCase()}`;
      } else if (event.status === "done") {
        icon = "check";
        text = `Completed stage: ${event.stage?.toUpperCase()}`;
      } else {
        icon = "arrow";
        text = `Stage ${event.stage}: ${event.status}`;
      }
      break;

    case "finding_done":
      if (event.status === "false_positive") {
        icon = "warn";
        text = `AI Triage: Filtered false positive for ${event.finding_id} (${event.cwe_id || "CWE"})`;
      } else if (event.status === "patch_generated") {
        icon = "check";
        text = `Remediation patch synthesized for ${event.finding_id}`;
        actionLabel = "Review Fix →";
        actionType = "findings";
      } else if (event.status?.includes("verified")) {
        icon = "check";
        text = `Verified remediation completed for ${event.finding_id} ${
          event.pr_url ? `(PR: ${event.pr_url})` : ""
        }`;
        actionLabel = event.pr_url ? "Review PR →" : "Inspect →";
        actionType = event.pr_url ? "pr" : "findings";
      } else {
        icon = "check";
        text = `Finding resolved with status: ${event.status}`;
        actionLabel = "Inspect →";
        actionType = "findings";
      }
      break;

    case "retry":
      icon = "warn";
      text = `Sandbox verification retry #${event.count || 1} for ${
        event.finding_id
      }: ${event.message || "Failed test assertions"}`;
      break;

    case "remediation_complete":
      icon = "check";
      text = `Synthesis done for ${event.finding_id} using model: ${
        event.model || "default"
      }`;
      actionLabel = "Review Fix →";
      actionType = "findings";
      break;

    case "verification_result":
      if (event.verified) {
        icon = "check";
        text = `Verification PASSED for ${event.finding_id} (${event.checks?.length || 0} checks)`;
      } else {
        icon = "error";
        text = `Verification FAILED for ${event.finding_id}: ${
          event.reason || "Check failures"
        }`;
      }
      break;

    case "pr_created":
      icon = "check";
      text = `GitHub PR #${event.pr_number || 1} opened on branch '${
        event.branch
      }': ${event.pr_url}`;
      actionLabel = "Review PR →";
      actionType = "pr";
      break;

    case "error":
      icon = "error";
      text = `Pipeline error: ${event.message || "Unknown error encountered"}`;
      break;

    case "heartbeat":
      icon = "arrow";
      text = `Keepalive ping [elapsed: ${event.elapsed_seconds?.toFixed(1) || 0}s]`;
      break;

    default:
      icon = "arrow";
      text = `Event [${event.type}]: ${JSON.stringify(event)}`;
  }

  return {
    id: `${index}-${event.type}-${event.ts || Date.now()}`,
    timestamp: ts,
    icon,
    text,
    type: event.type,
    raw: event,
    actionLabel,
    actionType,
  };
}

export const LiveEventLog: React.FC<LiveEventLogProps> = ({
  events,
  isWsConnected,
  isReconnecting,
  onNavigateToFindings,
  onNavigateToPR,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterType, setFilterType] = useState<"all" | "stages" | "findings">("all");

  const formattedEvents = events.map(formatEventToLine);

  const filteredEvents = formattedEvents.filter((item) => {
    if (filterType === "all") return true;
    if (filterType === "stages") return item.type === "stage" || item.type === "run_started";
    if (filterType === "findings")
      return (
        item.type === "finding_done" ||
        item.type === "verification_result" ||
        item.type === "pr_created" ||
        item.type === "findings_discovered"
      );
    return true;
  });

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [filteredEvents.length, autoScroll]);

  return (
    <div
      className={clsx(
        "surface-card rounded-2xl p-5 space-y-3 relative overflow-hidden select-none border border-[#292D2A]",
        className
      )}
    >
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#292D2A]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#151716] border border-[#292D2A] flex items-center justify-center text-[#8CFF8C]">
            <Terminal className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="font-sans font-semibold text-xs text-[#F4F5F4] tracking-tight">
              Real-Time Audit Stream
            </h4>
            <p className="font-mono text-[10px] text-[#666C68]">
              {events.length} system events received
            </p>
          </div>
        </div>

        {/* WebSocket connectivity badge & filters */}
        <div className="flex items-center gap-2.5">
          {isWsConnected ? (
            <Badge variant="green" size="xs" dot>
              Live Telemetry
            </Badge>
          ) : isReconnecting ? (
            <Badge variant="warning" size="xs" dot>
              Reconnecting...
            </Badge>
          ) : (
            <Badge variant="neutral" size="xs">
              Offline
            </Badge>
          )}

          <div className="flex items-center bg-[#151716] rounded-lg p-0.5 border border-[#292D2A] text-[10px] font-mono">
            {(["all", "stages", "findings"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilterType(mode)}
                className={clsx(
                  "px-2.5 py-1 rounded transition-colors capitalize cursor-pointer",
                  filterType === mode
                    ? "bg-[#16351F] text-[#8CFF8C] border border-[#8CFF8C]/35 font-semibold"
                    : "text-[#A5AAA6] hover:text-[#F4F5F4]"
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div
        ref={containerRef}
        onWheel={() => setAutoScroll(false)}
        className="h-80 overflow-y-auto rounded-xl bg-[#080909] border border-[#292D2A] p-4 font-mono text-xs space-y-1.5 select-text"
      >
        {filteredEvents.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[#666C68] text-xs">
            Waiting for live pipeline events...
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filteredEvents.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-start justify-between gap-2.5 py-1 hover:bg-white/[0.02] rounded px-1 transition-colors leading-relaxed group"
              >
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <span className="text-[#666C68] text-[11px] select-none shrink-0 mt-0.5">
                    [{item.timestamp}]
                  </span>

                  <span className="shrink-0 mt-0.5">
                    {item.icon === "check" && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#8CFF8C]" />
                    )}
                    {item.icon === "arrow" && (
                      <ArrowRight className="w-3.5 h-3.5 text-[#52D96B]" />
                    )}
                    {item.icon === "warn" && (
                      <AlertTriangle className="w-3.5 h-3.5 text-[#FFB84D]" />
                    )}
                    {item.icon === "error" && (
                      <XCircle className="w-3.5 h-3.5 text-[#FF5555]" />
                    )}
                  </span>

                  <span
                    className={clsx(
                      "flex-1 font-mono text-xs truncate",
                      item.icon === "check" && "text-[#F4F5F4]",
                      item.icon === "arrow" && "text-[#8CFF8C] font-medium",
                      item.icon === "warn" && "text-[#FFB84D]",
                      item.icon === "error" && "text-[#FFA3A3] font-semibold"
                    )}
                  >
                    {item.text}
                  </span>
                </div>

                {/* Actionable Link Pill */}
                {item.actionLabel && (
                  <button
                    type="button"
                    onClick={() => {
                      if (item.actionType === "pr" && onNavigateToPR) {
                        onNavigateToPR();
                      } else if (onNavigateToFindings) {
                        onNavigateToFindings();
                      }
                    }}
                    className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#16351F] border border-[#8CFF8C]/40 text-[#8CFF8C] hover:bg-[#8CFF8C] hover:text-[#080909] transition-all text-[10px] font-mono font-semibold cursor-pointer select-none"
                  >
                    <span>{item.actionLabel}</span>
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Auto-scroll notice */}
      {!autoScroll && (
        <div className="flex items-center justify-between text-[11px] font-mono text-[#666C68] pt-1">
          <span>Auto-scroll paused</span>
          <button
            type="button"
            onClick={() => setAutoScroll(true)}
            className="text-[#8CFF8C] hover:underline font-semibold cursor-pointer"
          >
            Resume live scroll ↓
          </button>
        </div>
      )}
    </div>
  );
};
