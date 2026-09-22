import React from "react";
import StatusBadge from "./StatusBadge.jsx";

export default function PRLinkCard({ finding }) {
  return (
    <div className="pr-card">
      <div className="pr-head">
        <a href={finding.pr_url} target="_blank" rel="noreferrer" className="pr-link">
          {finding.pr_url}
        </a>
        <StatusBadge status={finding.status} />
      </div>
      <div className="mono pr-finding">{finding.finding_id}</div>
      {finding.attempts && (
        <div className="hint">verified after {finding.attempts} attempt(s)</div>
      )}
    </div>
  );
}
