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

function computeDiff(original: string, patched: string, startLine: number = 1): DiffLine[] {
  const origLines = original.split("\n");
  const patchLines = patched.split("\n");
  const diff: DiffLine[] = [];

  let oIdx = 0;
  let pIdx = 0;

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
        while (pIdx < matchInPatch) {
          diff.push({
            patchNum: startLine + pIdx,
            patchText: patchLines[pIdx],
            type: "added",
          });
          pIdx++;
        }
      } else if (matchInOrig !== -1) {
        while (oIdx < matchInOrig) {
          diff.push({
            origNum: startLine + oIdx,
            origText: origLines[oIdx],
            type: "deleted",
          });
          oIdx++;
        }
      } else {
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
        "rounded-2xl border border-[#383838] bg-[#202020] overflow-hidden font-mono text-xs shadow-md",
        className
      )}
    >
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 bg-[#282828] border-b border-[#383838] select-none">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-[#EDEDED] truncate">
            {filePath || "Code Diff"}
          </span>
          <span className="text-[10px] text-[#8E8E8E] hidden md:inline">
            Side-by-side verification replacement
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle Split / Unified */}
          <div className="flex items-center bg-[#202020] rounded-lg p-0.5 border border-[#383838] text-[10px]">
            <button
              type="button"
              onClick={() => setViewMode("split")}
              className={clsx(
                "px-2.5 py-1 rounded flex items-center gap-1 transition-colors",
                viewMode === "split"
                  ? "bg-[#383838] text-white font-semibold"
                  : "text-[#8E8E8E] hover:text-[#EDEDED]"
              )}
            >
              <Columns className="w-3 h-3" />
              <span>Side-by-Side</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("unified")}
              className={clsx(
                "px-2.5 py-1 rounded flex items-center gap-1 transition-colors",
                viewMode === "unified"
                  ? "bg-[#383838] text-white font-semibold"
                  : "text-[#8E8E8E] hover:text-[#EDEDED]"
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
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono text-[#B8B8B8] hover:text-white bg-[#383838] hover:bg-[#484848] transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-[#4ade80]" />
                <span className="text-[#4ade80]">Copied Fix</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-[#8E8E8E]" />
                <span>Copy Fix</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Column Headers for Split View */}
      {viewMode === "split" && (
        <div className="grid grid-cols-2 bg-[#252525] border-b border-[#383838] text-[11px] font-mono text-[#8E8E8E] select-none">
          <div className="px-4 py-1.5 border-r border-[#383838] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#f87171]" />
            <span className="font-semibold text-[#fca5a5] uppercase tracking-wider text-[10px]">
              Current Code (Vulnerable)
            </span>
          </div>
          <div className="px-4 py-1.5 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#4ade80]" />
            <span className="font-semibold text-[#86efac] uppercase tracking-wider text-[10px]">
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
                  <tr key={idx} className="border-b border-[#282828]">
                    {/* LEFT (CURRENT CODE) */}
                    <td className="w-10 select-none pr-2 text-right text-[10px] text-[#6B6B6B] border-r border-[#383838] bg-[#1d1d1d] align-top py-0.5">
                      {row.origNum || ""}
                    </td>
                    <td
                      className={clsx(
                        "w-1/2 pr-3 pl-2 py-0.5 whitespace-pre align-top font-mono border-r border-[#383838]",
                        (isMod || isDel)
                          ? "bg-[#C24343]/20 text-[#fca5a5]"
                          : "text-[#EDEDED]"
                      )}
                    >
                      {(isMod || isDel) && (
                        <span className="text-[#f87171] font-bold select-none mr-1.5">
                          -
                        </span>
                      )}
                      {row.origText !== undefined ? row.origText : ""}
                    </td>

                    {/* RIGHT (SUGGESTED FIX) */}
                    <td className="w-10 select-none pr-2 text-right text-[10px] text-[#6B6B6B] border-r border-[#383838] bg-[#1d1d1d] align-top py-0.5">
                      {row.patchNum || ""}
                    </td>
                    <td
                      className={clsx(
                        "w-1/2 pr-3 pl-2 py-0.5 whitespace-pre align-top font-mono",
                        (isMod || isAdd)
                          ? "bg-[#2F7C5A]/25 text-[#86efac]"
                          : "text-[#EDEDED]"
                      )}
                    >
                      {(isMod || isAdd) && (
                        <span className="text-[#4ade80] font-bold select-none mr-1.5">
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
                      <tr className="bg-[#C24343]/20 text-[#fca5a5]">
                        <td className="w-12 select-none pr-2 text-right text-[10px] text-[#f87171]/70 border-r border-[#383838] py-0.5">
                          {row.origNum}
                        </td>
                        <td className="w-6 select-none text-center font-bold text-[#f87171] py-0.5">
                          -
                        </td>
                        <td className="pr-4 pl-1 py-0.5 whitespace-pre font-mono">
                          {row.origText}
                        </td>
                      </tr>
                      <tr className="bg-[#2F7C5A]/25 text-[#86efac]">
                        <td className="w-12 select-none pr-2 text-right text-[10px] text-[#4ade80]/70 border-r border-[#383838] py-0.5">
                          {row.patchNum}
                        </td>
                        <td className="w-6 select-none text-center font-bold text-[#4ade80] py-0.5">
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
                    <tr key={idx} className="bg-[#C24343]/20 text-[#fca5a5]">
                      <td className="w-12 select-none pr-2 text-right text-[10px] text-[#f87171]/70 border-r border-[#383838] py-0.5">
                        {row.origNum}
                      </td>
                      <td className="w-6 select-none text-center font-bold text-[#f87171] py-0.5">
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
                    <tr key={idx} className="bg-[#2F7C5A]/25 text-[#86efac]">
                      <td className="w-12 select-none pr-2 text-right text-[10px] text-[#4ade80]/70 border-r border-[#383838] py-0.5">
                        {row.patchNum}
                      </td>
                      <td className="w-6 select-none text-center font-bold text-[#4ade80] py-0.5">
                        +
                      </td>
                      <td className="pr-4 pl-1 py-0.5 whitespace-pre font-mono">
                        {row.patchText}
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={idx} className="text-[#EDEDED] hover:bg-white/[0.03]">
                    <td className="w-12 select-none pr-2 text-right text-[10px] text-[#6B6B6B] border-r border-[#383838] py-0.5">
                      {row.origNum}
                    </td>
                    <td className="w-6 select-none text-center text-[#6B6B6B] py-0.5">
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