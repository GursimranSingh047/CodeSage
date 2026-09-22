import React from "react";

export default function Skeleton({ rows = 3 }) {
  return (
    <div className="skeleton" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row" style={{ width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}
