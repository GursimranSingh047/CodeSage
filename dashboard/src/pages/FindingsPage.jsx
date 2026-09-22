import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchFindings, fetchStatus } from "../api.js";
import Skeleton from "../components/Skeleton.jsx";
import StatsCards from "../components/StatsCards.jsx";
import FindingsTable from "../components/FindingsTable.jsx";
import DiffViewer from "../components/DiffViewer.jsx";
import PRLinkCard from "../components/PRLinkCard.jsx";
import { useScanSession } from "../session/ScanSessionContext.jsx";

export default function FindingsPage() {
  const { scanId } = useParams();
  const { state: session } = useScanSession();
  const isLive = session.scanId === scanId && session.findings.length > 0;
  const [findings, setFindings] = useState(
    isLive ? session.findings : null
  );
  const [status, setStatus] = useState(null);
  const [selected, setSelected] = useState(null);
  const [artifacts, setArtifacts] = useState(null);

  useEffect(() => {
    if (isLive) {
      setFindings(session.findings);
      return;
    }
    // past scan: pull from the REST API
    fetchStatus(scanId).then(setStatus).catch(() => setStatus({ status: "unknown" }));
    fetchFindings(scanId)
      .then((data) => setFindings(data.completed || []))
      .catch(() => setFindings([]));
  }, [scanId, isLive, session.findings.length]);

  const counts = isLive ? session.counts : status?.counts || {};
  const prFindings = findings.filter((f) => f.pr_url);
  const openRow = async (findingId) => {
    setSelected(selected === findingId ? null : findingId);
    if (selected !== findingId) {
      const resp = await fetch(`/scan/${scanId}/findings/${encodeURIComponent(findingId)}/artifacts`);
      if (resp.ok) {
        const data = await resp.json();
        setArtifacts((prev) => ({ ...prev, [findingId]: data }));
      }
    }
  };

  return (
    <>
      <StatsCards
        total={findings ? findings.length : 0}
        confirmed={findings.filter((f) => f.status !== "false_positive").length}
        prs={prFindings.length}
        falsePositives={findings.filter((f) => f.status === "false_positive").length}
      />
      <section className="panel">
        <h2>Findings — scan {scanId}</h2>
        {!findings && <Skeleton rows={4} />}
        {findings && (
          <>
            <FindingsTable
              findings={findings}
              onRowClick={openRow}
              selectedId={selected}
            />
            {selected && (
              <DiffViewer findingId={selected} artifacts={artifacts?.[selected]} />
            )}
          </>
        )}
      </section>
      {prFindings.length > 0 && (
        <section className="panel">
          <h2>Pull Requests</h2>
          <div className="pr-list">
            {prFindings.map((f) => (
              <PRLinkCard key={f.finding_id} finding={f} />
            ))}
          </div>
        </section>
      )}
      {counts && Object.keys(counts).length > 0 && (
        <p className="hint mono">{JSON.stringify(counts)}</p>
      )}
    </>
  );
}
