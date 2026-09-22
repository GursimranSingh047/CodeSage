import React from "react";
import ReactDiffViewer from "react-diff-viewer-continued";

export default function DiffViewer({ findingId, artifacts }) {
  if (!artifacts || !artifacts.patch) {
    return <p className="hint">Loading patch for {findingId}…</p>;
  }
  const { patch, verification } = artifacts;
  return (
    <div className="diff-viewer">
      <h3>Diff — {patch.finding_id}</h3>
      <p className="hint">{patch.explanation}</p>
      {verification && (
        <p className={`hint verify-line ${verification.passed ? "ok" : "failed"}`}>
          verification: scan clean {String(verification.scan_clean)} · tests passed{" "}
          {String(verification.tests_passed)} · overall {String(verification.passed)}
          {verification.failure_reason ? ` — ${verification.failure_reason}` : ""}
        </p>
      )}
      <ReactDiffViewer
        oldValue={patch.original_code}
        newValue={patch.patched_code}
        splitView
        useDarkTheme
        styles={{
          variables: {
            dark: {
              diffViewerBackground: "#0d1117",
              diffViewerColor: "#c9d1d9",
              addedBackground: "#12261e",
              addedColor: "#7ee787",
              removedBackground: "#2d1416",
              removedColor: "#ffa198",
              wordAddedBackground: "#1f4d33",
              wordRemovedBackground: "#5c2226",
              gutterBackground: "#161b22",
              gutterColor: "#8b949e",
            },
          },
        }}
      />
    </div>
  );
}
