import React from "react";

export default function SkeletonState({ rows = 3, label }: { rows?: number; label?: string }) {
  return (
    <div className="animate-pulse space-y-2.5" role="status" aria-label={label ?? "Loading"}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-10 rounded-lg bg-raised"
          style={{ width: `${100 - (i % 3) * 9}%`, animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}
