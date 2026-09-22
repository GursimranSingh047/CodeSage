import React from "react";

export default function StatsCards({ total, confirmed, prs, falsePositives }) {
  const cards = [
    { label: "Findings processed", value: total, cls: "" },
    { label: "Real vulns confirmed", value: confirmed, cls: "stat-blue" },
    { label: "PRs opened", value: prs, cls: "stat-green" },
    { label: "False positives filtered", value: falsePositives, cls: "stat-muted" },
  ];
  return (
    <div className="stats-row">
      {cards.map((c) => (
        <div key={c.label} className={`stat-card ${c.cls}`}>
          <div className="stat-value">{c.value}</div>
          <div className="stat-label">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
