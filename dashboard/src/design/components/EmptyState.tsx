import React from "react";
import { Inbox } from "lucide-react";

export default function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-edge px-6 py-10 text-center">
      <Inbox size={20} className="text-dim" aria-hidden />
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="max-w-xs text-xs text-fog">{hint}</p>}
      {action}
    </div>
  );
}
