import React, { useState } from "react";
import { Copy, Check, Columns, AlignLeft } from "lucide-react";
import { clsx } from "clsx";

interface SideBySideDiffProps {
  originalCode: string;
  patchedCode: string;
  startLine?: number;
  filePath?: string;
  className?: string;
}

interface DiffLine {
  origNum?: number;
  origText?: string;
  patchNum?: number;
  patchText?: string;
  type: "unchanged" | "modified" | "added" | "deleted";
}

// Compute line-by-line diff between original and patched code
function computeDiff(original: string, patched: string, startLine: number = 1): DiffLine[] {
  const origLines = original.split("\n");
  const patchLines = patched.split("\n");
  const diff: DiffLine[] = [];

  let oIdx = 0;
  let pIdx = 0;

  // Simple Longest Common Subsequence or line comparison
  while (oIdx < origLines.length || pIdx < patchLines.length) {
    const oLine = origLines[oIdx];
    const pLine = patchLines[pIdx];

    if (oLine === pLine && oIdx < origLines.length && pIdx < patchLines.length) {
      diff.push({
        origNum: startLine + oIdx,
        origText: oLine,
        patchNum: startLine + pIdx,
        patchText: pLine,
        type: "unchanged",
      });
      oIdx++;
      pIdx++;
    } else {
      // Check lookahead
      let matchInPatch = -1;
      let matchInOrig = -1;

      for (let k = pIdx + 1; k < Math.min(pIdx + 5, patchLines.length); k++) {
        if (patchLines[k] === oLine) {
          matchInPatch = k;
          break;
        }
      }

      for (let k = oIdx + 1; k < Math.min(oIdx + 5, origLines.length); k++) {
        if (origLines[k] === pLine) {
          matchInOrig = k;
          break;
        }
      }

      if (matchInPatch !== -1 && (matchInOrig === -1 || matchInPatch - pIdx <= matchInOrig - oIdx)) {
        // Lines added in patch
        while (pIdx < matchInPatch) {
          diff.push({
            patchNum: startLine + pIdx,
            patchText: patchLines[pIdx],
            type: "added",
          });
          pIdx++;
        }
      } else if (matchInOrig !== -1) {
        // Lines removed from original
        while (oIdx < matchInOrig) {
          diff.push({
            origNum: startLine + oIdx,
            origText: origLines[oIdx],
            type: "deleted",
          });
          oIdx++;
        }
      } else {
        // Modified line
        if (oIdx < origLines.length && pIdx < patchLines.length) {
          diff.push({
            origNum: startLine + oIdx,
            origText: oLine,
            patchNum: startLine + pIdx,
            patchText: pLine,
            type: "modified",
          });
          oIdx++;
          pIdx++;
        } else if (oIdx < origLines.length) {
          diff.push({
            origNum: startLine + oIdx,
            origText: oLine,
            type: "deleted",
          });
          oIdx++;
        } else if (pIdx < patchLines.length) {
          diff.push({
            patchNum: startLine + pIdx,
            patchText: pLine,
            type: "added",
          });
          pIdx++;
        }
      }
    }
  }

  return diff;
}

// Redact secret patterns
function sanitizeSecret(text: string): string {
  if (!text) return "";
  return text
    .replace(/(?:ghp_[a-zA-Z0-9]{36})/g, "ghp_••••••••[REDACTED]")
    .replace(/(?:sk-[a-zA-Z0-9]{32,})/g, "sk-••••••••[REDACTED]")
    .replace(/(?:Bearer\s+[a-zA-Z0-9_\-\.]{20,})/gi, "Bearer ••••••••[REDACTED]");
}

export const SideBySideDiff: React.FC<SideBySideDiffProps> = ({
  originalCode,
  patchedCode,
  startLine = 1,
  filePath,
  className,
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"split" | "unified">("split");

  const diffLines = computeDiff(
    sanitizeSecret(originalCode),
    sanitizeSecret(patchedCode),
    startLine
  );

  const handleCopyPatched = () => {
    if (navigator?.clipboard && patchedCode) {
      navigator.clipboard.writeText(patchedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className={clsx(
        "rounded-xl border border-white/[0.08] bg-sage-950 overflow-hidden font-mono text-xs shadow-inner",
        className
      )}
    >
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 bg-sage-900 border-b border-white/[0.06] select-none">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-white truncate">
            {filePath || "Code Diff"}
          </span>
          <span className="text-[10px] text-sage-400 hidden md:inline">
            Side-by-side verification replacement
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle Split / Unified */}
          <div className="flex items-center bg-sage-950 rounded-lg p-0.5 border border-white/[0.06] text-[10px]">
            <button
              type="button"
              onClick={() => setViewMode("split")}
              className={clsx(
                "px-2 py-1 rounded flex items-center gap-1 transition-colors",
                viewMode === "split"
                  ? "bg-sage-800 text-white font-semibold"
                  : "text-sage-400 hover:text-white"
              )}
            >
              <Columns className="w-3 h-3" />
              <span>Side-by-Side</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("unified")}
              className={clsx(
                "px-2 py-1 rounded flex items-center gap-1 transition-colors",
                viewMode === "unified"
                  ? "bg-sage-800 text-white font-semibold"
                  : "text-sage-400 hover:text-white"
              )}
            >
              <AlignLeft className="w-3 h-3" />
              <span>Unified</span>
            </button>
          </div>

          {/* Copy Patched Code Button */}
          <button
            type="button"
            onClick={handleCopyPatched}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono text-sage-300 hover:text-white bg-sage-800 hover:bg-sage-700 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">Copied Fix</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-sage-400" />
                <span>Copy Fix</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Column Headers for Split View */}
      {viewMode === "split" && (
        <div className="grid grid-cols-2 bg-sage-900/60 border-b border-white/[0.06] text-[11px] font-mono text-sage-400 select-none">
          <div className="px-4 py-1.5 border-r border-white/[0.06] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500/80" />
            <span className="font-semibold text-rose-300 uppercase tracking-wider text-[10px]">
              Current Code (Vulnerable)
            </span>
          </div>
          <div className="px-4 py-1.5 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="font-semibold text-emerald-300 uppercase tracking-wider text-[10px]">
              Suggested Fix (Remediated)
            </span>
          </div>
        </div>
      )}

      {/* Diff Table View */}
      <div className="overflow-x-auto max-h-[500px] text-xs font-mono leading-relaxed select-text">
        {viewMode === "split" ? (
          <table className="w-full border-collapse">
            <tbody>
              {diffLines.map((row, idx) => {
                const isMod = row.type === "modified";
                const isDel = row.type === "deleted";
                const isAdd = row.type === "added";

                return (
                  <tr key={idx} className="border-b border-white/[0.02]">
                    {/* LEFT (CURRENT CODE) */}
                    <td className="w-10 select-none pr-2 text-right text-[10px] text-sage-600 border-r border-white/[0.06] bg-sage-950/40 align-top py-0.5">
                      {row.origNum || ""}
                    </td>
                    <td
                      className={clsx(
                        "w-1/2 pr-3 pl-2 py-0.5 whitespace-pre align-top font-mono border-r border-white/[0.06]",
                        (isMod || isDel)
                          ? "bg-rose-500/10 text-rose-300"
                          : "text-sage-300"
                      )}
                    >
                      {(isMod || isDel) && (
                        <span className="text-rose-400 font-bold select-none mr-1.5">
                          -
                        </span>
                      )}
                      {row.origText !== undefined ? row.origText : ""}
                    </td>

                    {/* RIGHT (SUGGESTED FIX) */}
                    <td className="w-10 select-none pr-2 text-right text-[10px] text-sage-600 border-r border-white/[0.06] bg-sage-950/40 align-top py-0.5">
                      {row.patchNum || ""}
                    </td>
                    <td
                      className={clsx(
                        "w-1/2 pr-3 pl-2 py-0.5 whitespace-pre align-top font-mono",
                        (isMod || isAdd)
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "text-sage-300"
                      )}
                    >
                      {(isMod || isAdd) && (
                        <span className="text-emerald-400 font-bold select-none mr-1.5">
                          +
                        </span>
                      )}
                      {row.patchText !== undefined ? row.patchText : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          /* UNIFIED VIEW */
          <table className="w-full border-collapse">
            <tbody>
              {diffLines.map((row, idx) => {
                const isMod = row.type === "modified";
                const isDel = row.type === "deleted";
                const isAdd = row.type === "added";

                if (isMod) {
                  return (
                    <React.Fragment key={idx}>
                      <tr className="bg-rose-500/10 text-rose-300">
                        <td className="w-12 select-none pr-2 text-right text-[10px] text-rose-400/60 border-r border-white/[0.06] py-0.5">
                          {row.origNum}
                        </td>
                        <td className="w-6 select-none text-center font-bold text-rose-400 py-0.5">
                          -
                        </td>
                        <td className="pr-4 pl-1 py-0.5 whitespace-pre font-mono">
                          {row.origText}
                        </td>
                      </tr>
                      <tr className="bg-emerald-500/10 text-emerald-300">
                        <td className="w-12 select-none pr-2 text-right text-[10px] text-emerald-400/60 border-r border-white/[0.06] py-0.5">
                          {row.patchNum}
                        </td>
                        <td className="w-6 select-none text-center font-bold text-emerald-400 py-0.5">
                          +
                        </td>
                        <td className="pr-4 pl-1 py-0.5 whitespace-pre font-mono">
                          {row.patchText}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                }

                if (isDel) {
                  return (
                    <tr key={idx} className="bg-rose-500/10 text-rose-300">
                      <td className="w-12 select-none pr-2 text-right text-[10px] text-rose-400/60 border-r border-white/[0.06] py-0.5">
                        {row.origNum}
                      </td>
                      <td className="w-6 select-none text-center font-bold text-rose-400 py-0.5">
                        -
                      </td>
                      <td className="pr-4 pl-1 py-0.5 whitespace-pre font-mono">
                        {row.origText}
                      </td>
                    </tr>
                  );
                }

                if (isAdd) {
                  return (
                    <tr key={idx} className="bg-emerald-500/10 text-emerald-300">
                      <td className="w-12 select-none pr-2 text-right text-[10px] text-emerald-400/60 border-r border-white/[0.06] py-0.5">
                        {row.patchNum}
                      </td>
                      <td className="w-6 select-none text-center font-bold text-emerald-400 py-0.5">
                        +
                      </td>
                      <td className="pr-4 pl-1 py-0.5 whitespace-pre font-mono">
                        {row.patchText}
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={idx} className="text-sage-300 hover:bg-white/[0.02]">
                    <td className="w-12 select-none pr-2 text-right text-[10px] text-sage-600 border-r border-white/[0.06] py-0.5">
                      {row.origNum}
                    </td>
                    <td className="w-6 select-none text-center text-sage-600 py-0.5">
                      {" "}
                    </td>
                    <td className="pr-4 pl-1 py-0.5 whitespace-pre font-mono">
                      {row.origText}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
