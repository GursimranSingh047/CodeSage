import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Terminal,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ScanEvent } from "@/types";
import { clsx } from "clsx";

interface LiveEventLogProps {
  events: ScanEvent[];
  isWsConnected: boolean;
  isReconnecting: boolean;
  className?: string;
}

interface FormattedEventLine {
  id: string;
  timestamp: string;
  icon: "check" | "arrow" | "warn" | "error";
  text: string;
  type: string;
  raw: ScanEvent;
}

function formatEventToLine(event: ScanEvent, index: number): FormattedEventLine {
  const ts = event.ts
    ? new Date(event.ts).toLocaleTimeString(undefined, {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : new Date().toLocaleTimeString(undefined, {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

  let icon: "check" | "arrow" | "warn" | "error" = "arrow";
  let text = "";

  switch (event.type) {
    case "run_started":
      icon = "arrow";
      text = `Initiating pipeline run for repository: ${event.repo || "target"}`;
      break;

    case "repo_ingested":
      icon = "check";
      text = `Repository cloned and workspace initialized [${event.branch || "default"}]`;
      break;

    case "findings_discovered":
      icon = "check";
      text = `Static discovery completed: ${event.count} potential finding(s) discovered`;
      break;

    case "stage":
      if (event.status === "active") {
        icon = "arrow";
        text = `Starting stage: ${event.stage?.toUpperCase()}${
          event.finding_id ? ` for ${event.finding_id}` : ""
        }`;
      } else {
        icon = "check";
        text = `Completed stage: ${event.stage?.toUpperCase()}`;
      }
      break;

    case "finding_done":
      if (event.status === "false_positive") {
        icon = "check";
        text = `Filtered false positive [${event.cwe_id || "CWE"}]: ${
          event.finding_id
        }`;
      } else if (event.status?.includes("verified")) {
        icon = "check";
        text = `Verified remediation completed for ${event.finding_id} ${
          event.pr_url ? `(PR: ${event.pr_url})` : ""
        }`;
      } else {
        icon = "check";
        text = `Finding resolved with status: ${event.status}`;
      }
      break;

    case "retry":
      icon = "warn";
      text = `Sandbox verification retry #${event.count || 1} for ${
        event.finding_id
      }: ${event.message || "Failed test assertions"}`;
      break;

    case "run_complete":
      icon = "check";
      text = `Autonomous audit run complete (${event.duration_s || 0}s elapsed)`;
      break;

    case "cancelled":
      icon = "warn";
      text = `Pipeline cancelled: ${event.message || "User requested stop"}`;
      break;

    case "error":
      icon = "error";
      text = `Pipeline error: ${event.message || "Execution exception"}`;
      break;

    default:
      icon = "arrow";
      text = event.message || JSON.stringify(event);
  }

  return {
    id: `${event.type}-${index}-${event.ts || Math.random()}`,
    timestamp: ts,
    icon,
    text,
    type: event.type,
    raw: event,
  };
}

export const LiveEventLog: React.FC<LiveEventLogProps> = ({
  events,
  isWsConnected,
  isReconnecting,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterType, setFilterType] = useState<"all" | "stages" | "findings">("all");

  const formattedEvents = events.map(formatEventToLine);

  const filteredEvents = formattedEvents.filter((item) => {
    if (filterType === "stages") {
      return item.type === "stage" || item.type === "run_started" || item.type === "run_complete";
    }
    if (filterType === "findings") {
      return item.type === "findings_discovered" || item.type === "finding_done" || item.type === "retry";
    }
    return true;
  });

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  return (
    <Card variant="elevated" className={clsx("p-5 sm:p-6 space-y-4", className)}>
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-sage-900 border border-white/[0.08] text-accent-orange">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-sans font-semibold text-white tracking-tight flex items-center gap-2">
              <span>Real-Time Event Stream</span>
              <span className="text-[11px] font-mono font-normal text-sage-400">
                ({events.length} event{events.length === 1 ? "" : "s"})
              </span>
            </h3>
            <p className="text-[11px] font-mono text-sage-500">
              Live updates directly from LangGraph state updates.
            </p>
          </div>
        </div>

        {/* Right Status Indicator & Filter */}
        <div className="flex items-center gap-2.5">
          {/* Connection Status Pill */}
          {isWsConnected ? (
            <Badge variant="teal" size="xs" dot>
              <Wifi className="w-3 h-3 inline mr-1" />
              Live Stream
            </Badge>
          ) : isReconnecting ? (
            <Badge variant="warning" size="xs" dot>
              <WifiOff className="w-3 h-3 inline mr-1" />
              Reconnecting...
            </Badge>
          ) : (
            <Badge variant="neutral" size="xs">
              REST Polling
            </Badge>
          )}

          {/* Filter Pill Switcher */}
          <div className="flex items-center bg-sage-900 rounded-lg p-0.5 border border-white/[0.06] text-[10px] font-mono">
            <button
              type="button"
              onClick={() => setFilterType("all")}
              className={clsx(
                "px-2 py-1 rounded transition-colors",
                filterType === "all" ? "bg-sage-800 text-white font-semibold" : "text-sage-400 hover:text-white"
              )}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilterType("stages")}
              className={clsx(
                "px-2 py-1 rounded transition-colors",
                filterType === "stages" ? "bg-sage-800 text-white font-semibold" : "text-sage-400 hover:text-white"
              )}
            >
              Stages
            </button>
            <button
              type="button"
              onClick={() => setFilterType("findings")}
              className={clsx(
                "px-2 py-1 rounded transition-colors",
                filterType === "findings" ? "bg-sage-800 text-white font-semibold" : "text-sage-400 hover:text-white"
              )}
            >
              Findings
            </button>
          </div>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div
        ref={containerRef}
        onWheel={() => setAutoScroll(false)}
        className="h-80 overflow-y-auto rounded-xl bg-sage-950/90 border border-white/[0.06] p-4 font-mono text-xs space-y-2 selection:bg-accent-orange/20"
      >
        {filteredEvents.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sage-600 text-xs">
            Waiting for live pipeline events...
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filteredEvents.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-start gap-2.5 py-0.5 hover:bg-white/[0.02] rounded px-1 transition-colors leading-relaxed"
              >
                {/* Timestamp */}
                <span className="text-sage-600 text-[11px] select-none shrink-0 mt-0.5">
                  [{item.timestamp}]
                </span>

                {/* Status Symbol */}
                <span className="shrink-0 mt-0.5">
                  {item.icon === "check" && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  {item.icon === "arrow" && (
                    <ArrowRight className="w-3.5 h-3.5 text-accent-orange" />
                  )}
                  {item.icon === "warn" && (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  {item.icon === "error" && (
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  )}
                </span>

                {/* Event Message */}
                <span
                  className={clsx(
                    "flex-1 font-mono text-xs",
                    item.icon === "check" && "text-sage-200",
                    item.icon === "arrow" && "text-white font-medium",
                    item.icon === "warn" && "text-amber-300",
                    item.icon === "error" && "text-rose-300 font-semibold"
                  )}
                >
                  {item.text}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Auto-scroll release notice */}
      {!autoScroll && (
        <div className="flex items-center justify-between text-[11px] font-mono text-sage-400 pt-1">
          <span>Auto-scroll paused</span>
          <button
            type="button"
            onClick={() => setAutoScroll(true)}
            className="text-accent-orange hover:underline"
          >
            Resume live scroll ↓
          </button>
        </div>
      )}
    </Card>
  );
};
