import React from "react";
import StatusBadge from "./StatusBadge.jsx";

const shortId = (id) => {
  const parts = String(id).split(":");
  return parts.length >= 4 ? `${parts[1]}:${parts[2]}` : id;
};

export default function FindingsTable({ findings, onRowClick, selectedId }) {
  if (findings.length === 0) {
    return <p className="hint">No findings processed yet — start a scan above.</p>;
  }
  const sorted = [...findings].sort((a, b) => a.finding_id.localeCompare(b.finding_id));
  return (
    <table className="findings-table">
      <thead>
        <tr>
          <th>Status</th>
          <th>Finding</th>
          <th>CWE</th>
          <th>Tool</th>
          <th>Attempts</th>
          <th>Pull Request</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((f) => (
          <tr
            key={f.finding_id}
            className={selectedId === f.finding_id ? "selected" : ""}
            onClick={() => onRowClick(f.finding_id)}
          >
            <td><StatusBadge status={f.status} /></td>
            <td className="mono">{shortId(f.finding_id)}</td>
            <td>{f.cwe_id || "—"}</td>
            <td>{f.tool_source || ""}</td>
            <td>{f.attempts ?? 1}</td>
            <td>
              {f.pr_url ? (
                <a href={f.pr_url} target="_blank" rel="noreferrer">{f.pr_url}</a>
              ) : (
                "—"
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
