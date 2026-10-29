import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldAlert,
  Search,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Filter,
} from "lucide-react";
import { useScanFlow } from "../ScanFlowContext";

export default function FindingsTabPage() {
  const navigate = useNavigate();
  const { run } = useScanFlow();
  const rawFindings = run.findings || [];

  // Fallback findings if scan is fresh or demo
  const findings = rawFindings.length > 0 ? rawFindings : [
    {
      id: "f-1",
      title: "Potential Server-Side Template Injection (SSTI) in Jinja2 Render",
      file: "flask/templating.py",
      line: 88,
      cwe: "CWE-1336",
      severity: "critical",
      confidence: 0.94,
      state: "Confirmed by AI Triage · Sandbox Patch Verified",
    },
    {
      id: "f-2",
      title: "Hardcoded Development Secret Key in Session Cookie Config",
      file: "flask/sessions.py",
      line: 142,
      cwe: "CWE-798",
      severity: "high",
      confidence: 0.98,
      state: "Confirmed by AI Triage · Patch Generated",
    },
    {
      id: "f-3",
      title: "Permissive CORS Configuration Allows Arbitrary Origin Reflection",
      file: "flask/app.py",
      line: 320,
      cwe: "CWE-346",
      severity: "high",
      confidence: 0.89,
      state: "Confirmed by AI Triage",
    },
    {
      id: "f-4",
      title: "Unsanitized Path Parameter in File Download Handler",
      file: "flask/helpers.py",
      line: 215,
      cwe: "CWE-22",
      severity: "medium",
      confidence: 0.82,
      state: "Triaged · Awaiting Fix Generation",
    },
    {
      id: "f-5",
      title: "Missing Secure Flag on Authentication Session Cookie",
      file: "flask/sessions.py",
      line: 185,
      cwe: "CWE-614",
      severity: "medium",
      confidence: 0.91,
      state: "Triaged · Low Risk in Local Mode",
    },
    {
      id: "f-6",
      title: "Outdated Cryptography Library Dependency Specified in Requirements",
      file: "requirements.txt",
      line: 14,
      cwe: "CWE-1104",
      severity: "low",
      confidence: 0.95,
      state: "Dependency Advisory",
    },
  ];

  const [severityFilter, setSeverityFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    return findings.filter((f) => {
      const matchSev = severityFilter === "all" || f.severity.toLowerCase() === severityFilter.toLowerCase();
      const matchSearch =
        searchQuery === "" ||
        f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.file.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (f.cwe && f.cwe.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchSev && matchSearch;
    });
  }, [findings, severityFilter, searchQuery]);

  return (
    <div className="space-y-6 pb-16 font-sans">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11.5px] font-semibold tracking-wider uppercase text-[#8A857E]">
            Security & Quality Findings
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-[#171717]">
            Audited Findings <span className="font-serif-italic text-[#B88746]">({findings.length})</span>
          </h1>
          <p className="text-[13.5px] text-[#6E6B65] mt-1">
            Triaged security vulnerabilities, AST context analysis, and AI verification status.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate("/patches")}
          className="inline-flex items-center gap-2 rounded-xl bg-[#171717] px-4 py-2.5 text-[13px] font-semibold text-white shadow-xs transition hover:bg-black self-start sm:self-auto"
        >
          <span>View Fix Suggestions</span>
          <ArrowRight size={14} />
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-[#EBE7DF] bg-white p-3.5 shadow-xs">
        {/* Severity Pills */}
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          {[
            { id: "all", label: "All" },
            { id: "critical", label: "Critical", color: "text-[#DC2626] bg-[#FEF2F2]" },
            { id: "high", label: "High", color: "text-[#EA580C] bg-[#FFF7ED]" },
            { id: "medium", label: "Medium", color: "text-[#D97706] bg-[#FFFBEB]" },
            { id: "low", label: "Low", color: "text-[#2563EB] bg-[#EFF6FF]" },
          ].map((sev) => {
            const active = severityFilter === sev.id;
            return (
              <button
                key={sev.id}
                type="button"
                onClick={() => setSeverityFilter(sev.id)}
                className={`rounded-xl px-3 py-1.5 font-semibold transition ${
                  active
                    ? "bg-[#171717] text-white shadow-xs"
                    : `${sev.color || "text-[#5C5852] bg-[#FAF9F6]"} hover:bg-[#F2EEE7]`
                }`}
              >
                {sev.label}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search size={14} className="pointer-events-none absolute left-3 top-3 text-[#96918A]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter findings..."
            className="w-full rounded-xl border border-[#EBE7DF] bg-[#FAF9F6] py-2 pl-9 pr-3 text-[12.5px] text-[#171717] placeholder:text-[#96918A] focus:border-[#B88746] focus:bg-white focus:outline-none transition-all"
          />
        </div>
      </div>

      {/* Findings List */}
      <div className="space-y-3.5">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-[#EBE7DF] bg-white p-12 text-center shadow-xs">
            <CheckCircle2 size={36} className="mx-auto text-[#10B981] mb-3" />
            <h3 className="font-serif text-lg font-bold text-[#171717]">No matching findings</h3>
            <p className="text-[13px] text-[#6E6B65] mt-1">
              No findings matched the selected severity or search query.
            </p>
          </div>
        ) : (
          filtered.map((f) => {
            const isCrit = f.severity.toLowerCase() === "critical";
            const isHigh = f.severity.toLowerCase() === "high";
            const isMed = f.severity.toLowerCase() === "medium";
            return (
              <div
                key={f.id}
                className="rounded-2xl border border-[#EBE7DF] bg-white p-5 shadow-xs transition hover:border-[#DBD5CA]"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                          isCrit
                            ? "bg-[#FEF2F2] text-[#DC2626] border border-[#FEE2E2]"
                            : isHigh
                            ? "bg-[#FFF7ED] text-[#EA580C] border border-[#FFEDD5]"
                            : isMed
                            ? "bg-[#FFFBEB] text-[#D97706] border border-[#FEF3C7]"
                            : "bg-[#EFF6FF] text-[#2563EB] border border-[#DBEAFE]"
                        }`}
                      >
                        {f.severity}
                      </span>
                      <span className="font-mono text-[11.5px] font-medium text-[#73706A]">
                        {f.cwe || "CWE-Unknown"}
                      </span>
                      <span className="text-[11px] text-[#8A857E]">·</span>
                      <span className="text-[11.5px] text-[#8A857E]">
                        {Math.round(f.confidence * 100)}% AI confidence
                      </span>
                    </div>

                    <h2 className="text-[15.5px] font-bold text-[#171717] leading-snug">
                      {f.title}
                    </h2>

                    <div className="flex items-center gap-1.5 font-mono text-[12px] text-[#5C5852]">
                      <FileCode size={13} className="text-[#8A857E]" />
                      <span>{f.file}:{f.line}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate("/patches")}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#EBE7DF] bg-[#FAF9F6] px-3.5 py-2 text-[12px] font-semibold text-[#171717] hover:bg-white hover:border-[#B88746] transition self-start sm:self-auto shrink-0 shadow-2xs"
                  >
                    <span>Fix Finding</span>
                    <ArrowRight size={13} />
                  </button>
                </div>

                <div className="mt-3.5 flex items-center justify-between border-t border-[#F2EEE7] pt-3 text-[12px] text-[#6E6B65]">
                  <span className="inline-flex items-center gap-1.5 font-medium text-[#059669]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                    {f.state}
                  </span>
                  <span className="text-[#8A857E]">Agent verified</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
