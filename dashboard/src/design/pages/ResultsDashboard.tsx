import React from "react";
import { useNavigate } from "react-router-dom";
import { Download, Search, ScanSearch, FileCode, ShieldAlert, Wrench, CheckCircle2, GitPullRequest } from "lucide-react";
import { useScanFlow } from "../ScanFlowContext";
import NotchedCard from "../components/NotchedCard";
import NotchedButton from "../components/NotchedButton";

// Final report numbers for the demo run (mock — mirrors the real demo scan:
// 49 findings flagged, 38 false positives filtered, 1,248 files, 4/8 fixed).
const REPORT = {
  fixed: "4 / 8",
  flagged: 49,
  falsePositives: 38,
  filesScanned: "1,248",
  prsOpened: 1,
  severity: [
    { label: "Critical", count: 1 },
    { label: "High", count: 3 },
    { label: "Medium", count: 3 },
    { label: "Low", count: 2 },
  ],
  trace: [
    { icon: Search, name: "Ingestion Agent", line: "Cloned repository and detected language/framework" },
    { icon: ScanSearch, name: "Scanning Agent", line: "Ran Semgrep, Bandit, and Gitleaks — found 6 raw findings" },
    { icon: FileCode, name: "Context Agent", line: "Extracted function-level context for 6 findings" },
    { icon: ShieldAlert, name: "Triage Agent", line: "Classified findings — 4 confirmed real, 2 false positives filtered" },
    { icon: Wrench, name: "Patch Agent", line: "Generated fixes for 4 confirmed vulnerabilities" },
    { icon: CheckCircle2, name: "Verification Agent", line: "Verified 4 patches in sandbox — 4 passed, 0 needed retry" },
    { icon: GitPullRequest, name: "PR Agent", line: "Opened 1 pull request with the verified fixes" },
  ],
};

function downloadReport() {
  const md = [
    "# CodeSage — Security Summary (Scan #CS-1048)",
    "",
    "## Vulnerabilities fixed",
    `${REPORT.fixed} confirmed vulnerabilities patched and opened as pull requests.`,
    "Nothing is merged automatically — review each PR before merging.",
    "",
    "## Outcome",
    `- Findings flagged: ${REPORT.flagged}`,
    "- False positives filtered: 38",
    `- Files scanned: ${REPORT.filesScanned}`,
    `- Pull requests opened: ${REPORT.prsOpened}`,
    "",
    "## Findings by severity",
    ...REPORT.severity.map((s) => `- ${s.label}: ${s.count}`),
    "",
    "## Agent trace",
    ...REPORT.trace.map((t) => `- ${t.name}: ${t.line}`),
    "",
  ].join("\n");
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "codesage_scan_report.md";
  a.click();
  URL.revokeObjectURL(url);
}

export default function ResultsDashboard() {
  const navigate = useNavigate();
  const maxSev = Math.max(...REPORT.severity.map((s) => s.count));

  return (
    <div className="relative min-h-screen bg-void font-sans text-ink">
      <div className="grid-bg" aria-hidden />
      <header className="relative z-10 mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-mint font-display text-sm font-bold text-black">CS</span>
          <span className="font-display text-lg font-semibold">CodeSage</span>
        </div>
        <nav className="flex flex-wrap items-center gap-2.5" aria-label="Scan sections">
          {[
            ["Dashboard", "/results", true],
            ["Findings", "/findings", false],
            ["Patches", "/patches", false],
            ["Pipeline", "/pipeline", false],
          ].map(([label, to, active]) => (
            <a
              key={label as string}
              href={to as string}
              onClick={(e) => {
                e.preventDefault();
                navigate(to as string);
              }}
              aria-current={active ? "page" : undefined}
              className={`notch-tr inline-flex px-4 py-1.5 text-[12.5px] font-semibold transition ${
                active ? "bg-mint text-black" : "border border-edge bg-[#0f120f] text-fog hover:text-ink"
              }`}
            >
              {label as string}
            </a>
          ))}
        </nav>
      </header>

      <div className="relative z-10 mx-auto max-w-6xl px-6 pb-20">
        <div className="flex flex-wrap items-end justify-between gap-4 pt-6">
          <div>
            <p className="text-[15px] text-fog">Audit Dashboard</p>
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Security Summary</h1>
          </div>
          <NotchedButton corner="top-right" onClick={downloadReport}>
            <Download size={15} /> Download Report
          </NotchedButton>
        </div>

        {/* hero stat */}
        <div className="pt-16 pb-14 text-center">
          <p className="text-[13px] font-semibold uppercase tracking-[2.5px] text-fog">
            Vulnerabilities fixed
          </p>
          <p className="font-display mt-3 text-8xl font-bold text-mint">{REPORT.fixed}</p>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-fog">
            Confirmed vulnerabilities patched and opened as pull requests. Nothing is merged
            automatically — review each PR before merging.
          </p>
        </div>

        {/* three stat cards */}
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            ["Findings flagged", String(REPORT.flagged), "top-right"],
            ["False positives filtered", String(REPORT.falsePositives), "bottom-left"],
            ["Files scanned", REPORT.filesScanned, "top-right"],
          ].map(([label, value, corner]) => (
            <NotchedCard key={label} corner={corner as never} innerClassName="px-6 py-6">
              <p className="text-[12px] font-semibold uppercase tracking-[2px] text-fog">{label}</p>
              <p className="font-display mt-2 text-4xl font-bold">{value}</p>
            </NotchedCard>
          ))}
        </div>

        {/* severity chart + agent trace */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <NotchedCard corner="top-left" innerClassName="px-6 py-6">
            <h2 className="font-display text-xl font-semibold">Findings by Severity</h2>
            <p className="mt-1 text-[12.5px] text-fog">Triaged findings grouped by severity</p>
            <div className="mt-8 flex h-44 items-end justify-around gap-6 px-2">
              {REPORT.severity.map(({ label, count }) => (
                <div key={label} className="flex h-full w-16 flex-col items-center justify-end gap-2">
                  <span className="font-mono text-[12px] text-fog">{count}</span>
                  <div
                    className="w-full bg-mint/80 transition-all"
                    style={{ height: `${(count / maxSev) * 100}%`, minHeight: 6 }}
                    role="img"
                    aria-label={`${label}: ${count}`}
                  />
                  <span className="text-[11.5px] text-fog">{label}</span>
                </div>
              ))}
            </div>
          </NotchedCard>

          <NotchedCard corner="bottom-right" innerClassName="px-6 py-6">
            <h2 className="font-display text-xl font-semibold">Agent Trace</h2>
            <p className="mt-1 text-[12.5px] text-fog">Tracing progress — 7 specialized agents, 7 stages</p>
            <ol className="mt-6 space-y-4">
              {REPORT.trace.map(({ icon: Icon, name, line }) => (
                <li key={name} className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-edge bg-[#0c0f0c] text-fog">
                    <Icon size={15} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-ink">{name}</p>
                    <p className="truncate text-[12px] text-fog">{line}</p>
                  </div>
                </li>
              ))}
            </ol>
          </NotchedCard>
        </div>
      </div>
    </div>
  );
}
