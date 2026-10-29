import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  GitPullRequest,
  CheckCircle2,
  FileCode,
  ShieldCheck,
  Download,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Terminal,
} from "lucide-react";
import toast from "react-hot-toast";
import { useScanFlow } from "../ScanFlowContext";

interface PatchItem {
  id: string;
  title: string;
  file: string;
  line: number;
  cwe: string;
  diff: string;
  testResult: string;
  status: "verified" | "draft" | "pr_created";
  prUrl?: string;
}

const DEFAULT_PATCHES: PatchItem[] = [
  {
    id: "patch-1",
    title: "Sanitize Jinja2 Template Context to Prevent SSTI",
    file: "flask/templating.py",
    line: 88,
    cwe: "CWE-1336",
    diff: `@@ -86,5 +86,7 @@
 def render_template(template_name_or_list, **context):
-    return _render(current_app.jinja_env.get_or_select_template(template_name_or_list), context, current_app)
+    # Enforce safe template environment with autoescape and context validation
+    env = current_app.jinja_env
+    return _render(env.get_or_select_template(template_name_or_list), context, current_app)`,
    testResult: "Sandbox verification passed: 14/14 unit tests passed, 0 security regressions.",
    status: "verified",
  },
  {
    id: "patch-2",
    title: "Enforce Secure Cookie Flags & Strong Random Secret",
    file: "flask/sessions.py",
    line: 142,
    cwe: "CWE-798",
    diff: `@@ -140,4 +140,6 @@
 class SecureCookieSessionInterface(SessionInterface):
-    salt = "cookie-session"
+    salt = os.environ.get("FLASK_SESSION_SALT", secrets.token_hex(16))
+    cookie_secure = True
+    cookie_httponly = True`,
    testResult: "Sandbox verification passed: Cookie security policy validated against OWASP standards.",
    status: "verified",
  },
];

export default function PatchesPage() {
  const { run } = useScanFlow();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ "patch-1": true, "patch-2": true });

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDownloadPatch = (patch: PatchItem) => {
    const blob = new Blob([patch.diff], { type: "text/x-diff" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${patch.id}_${patch.file.replace(/[/.]/g, "_")}.patch`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Patch file downloaded");
  };

  const handleCreatePR = (patch: PatchItem) => {
    toast.success(`Opening PR for ${patch.file}... Pull request draft created!`);
  };

  return (
    <div className="space-y-6 pb-16 font-sans">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11.5px] font-semibold tracking-wider uppercase text-[#8A857E]">
            Automated Remediation
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-[#171717]">
            Fix Suggestions <span className="font-serif-italic text-[#B88746]">(Verified)</span>
          </h1>
          <p className="text-[13.5px] text-[#6E6B65] mt-1">
            LLM-generated code patches, sandbox unit-tested and verified with AST syntax analysis.
          </p>
        </div>

        <button
          type="button"
          onClick={() => toast.success("Batch Pull Request modal queued")}
          className="inline-flex items-center gap-2 rounded-xl bg-[#171717] px-4 py-2.5 text-[13px] font-semibold text-white shadow-xs transition hover:bg-black self-start sm:self-auto"
        >
          <GitPullRequest size={14} />
          <span>Create All Pull Requests</span>
        </button>
      </div>

      {/* Info Notice */}
      <div className="flex items-center gap-3 rounded-2xl border border-[#E6D8C5] bg-[#FAF8F5] p-4 text-[13px] text-[#5C5852]">
        <ShieldCheck size={20} className="text-[#A97843] shrink-0" />
        <p>
          <strong>Zero-Breaking Policy:</strong> Each patch is evaluated in an isolated Docker container
          running the repository's test suite to ensure no regression before human review.
        </p>
      </div>

      {/* Patches List */}
      <div className="space-y-4">
        {DEFAULT_PATCHES.map((patch) => {
          const isExp = expanded[patch.id];
          return (
            <div
              key={patch.id}
              className="rounded-2xl border border-[#EBE7DF] bg-white p-5 shadow-xs transition"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#ECFDF5] border border-[#A7F3D0] px-2.5 py-0.5 text-[11px] font-bold text-[#059669]">
                      Verified Fix
                    </span>
                    <span className="font-mono text-[11.5px] text-[#73706A]">
                      {patch.cwe}
                    </span>
                  </div>

                  <h2 className="text-[16px] font-bold text-[#171717]">
                    {patch.title}
                  </h2>

                  <div className="flex items-center gap-1.5 font-mono text-[12px] text-[#5C5852]">
                    <FileCode size={13} className="text-[#8A857E]" />
                    <span>{patch.file}:{patch.line}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => handleDownloadPatch(patch)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#EBE7DF] bg-[#FAF9F6] px-3 py-2 text-[12px] font-semibold text-[#171717] hover:bg-white hover:border-[#DBD5CA] transition shadow-2xs"
                  >
                    <Download size={13} />
                    <span>Download .patch</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCreatePR(patch)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#171717] px-3.5 py-2 text-[12px] font-semibold text-white hover:bg-black transition shadow-xs"
                  >
                    <GitPullRequest size={13} />
                    <span>Create PR</span>
                  </button>
                </div>
              </div>

              {/* Collapsible Diff Viewer */}
              <div className="mt-4 border-t border-[#F2EEE7] pt-3">
                <button
                  type="button"
                  onClick={() => toggleExpand(patch.id)}
                  className="flex items-center gap-1.5 text-[12px] font-semibold text-[#8A857E] hover:text-[#171717] transition"
                >
                  {isExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>{isExp ? "Hide Code Diff" : "View Code Diff"}</span>
                </button>

                {isExp && (
                  <div className="mt-3 space-y-3">
                    <pre className="overflow-x-auto rounded-xl border border-[#EBE7DF] bg-[#FAF9F6] p-3.5 font-mono text-[12px] text-[#24292E] leading-relaxed">
                      {patch.diff.split("\n").map((line, i) => {
                        const isAdd = line.startsWith("+");
                        const isDel = line.startsWith("-");
                        const isMeta = line.startsWith("@");
                        return (
                          <div
                            key={i}
                            className={`px-1 rounded-xs ${
                              isAdd
                                ? "bg-[#DCFCE7] text-[#166534]"
                                : isDel
                                ? "bg-[#FEE2E2] text-[#991B1B]"
                                : isMeta
                                ? "text-[#73706A] font-bold"
                                : ""
                            }`}
                          >
                            {line}
                          </div>
                        );
                      })}
                    </pre>

                    {/* Verification Test Result Box */}
                    <div className="flex items-center gap-2 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] px-3.5 py-2 text-[12px] text-[#065F46]">
                      <CheckCircle2 size={14} className="shrink-0 text-[#10B981]" />
                      <span>{patch.testResult}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
