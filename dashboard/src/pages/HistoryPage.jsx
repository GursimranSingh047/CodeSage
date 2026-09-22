import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listScans } from "../api.js";
import Skeleton from "../components/Skeleton.jsx";

export default function HistoryPage() {
  const [scans, setScans] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    listScans()
      .then((data) => setScans(data.scans || []))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <section className="panel">
      <h2>Scan History</h2>
      {!scans && !error && <Skeleton rows={3} />}
      {error && <p className="hint">Failed to load history: {error}</p>}
      {scans && scans.length === 0 && (
        <p className="hint">No scans yet — run your first one from the Scan page.</p>
      )}
      {scans && scans.length > 0 && (
        <table className="findings-table">
          <thead>
            <tr>
              <th>Scan</th>
              <th>Repository</th>
              <th>Status</th>
              <th>Findings</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {scans.map((scan) => (
              <tr key={scan.scan_id}>
                <td className="mono">{scan.scan_id}</td>
                <td className="mono repo-cell">
                  <Link to={`/dashboard/scan/${scan.scan_id}/findings`}>{scan.repo_url}</Link>
                </td>
                <td>{scan.status}</td>
                <td>{Object.values(scan.counts || {}).reduce((a, b) => a + b, 0)}</td>
                <td className="dim">{new Date(scan.started * 1000).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
