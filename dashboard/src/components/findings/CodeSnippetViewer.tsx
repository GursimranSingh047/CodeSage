import React, { useState } from "react";
import { Copy, Check, FileCode } from "lucide-react";
import { clsx } from "clsx";

interface CodeSnippetViewerProps {
  code: string;
  targetLine: number;
  startLine?: number;
  filePath?: string;
  className?: string;
}

function highlightSyntax(lineText: string): React.ReactNode {
  const parts = lineText.split(
    /(\b(?:def|class|return|import|from|as|if|elif|else|for|while|try|except|finally|with|raise|assert|in|is|not|and|or|None|True|False)\b|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|#[^\n]*)/g
  );

  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith("#")) {
      return (
        <span key={i} className="text-[#666C68] italic">
          {part}
        </span>
      );
    }
    if (
      (part.startsWith('"') && part.endsWith('"')) ||
      (part.startsWith("'") && part.endsWith("'"))
    ) {
      return (
        <span key={i} className="text-[#8CFF8C]">
          {part}
        </span>
      );
    }
    if (
      /^\b(?:def|class|return|import|from|as|if|elif|else|for|while|try|except|finally|with|raise|assert|in|is|not|and|or)\b$/.test(
        part
      )
    ) {
      return (
        <span key={i} className="text-[#52D96B] font-semibold">
          {part}
        </span>
      );
    }
    if (/^\b(?:None|True|False)\b$/.test(part)) {
      return (
        <span key={i} className="text-[#8CFF8C] font-medium">
          {part}
        </span>
      );
    }
    return <span key={i} className="text-[#F4F5F4]">{part}</span>;
  });
}

export const CodeSnippetViewer: React.FC<CodeSnippetViewerProps> = ({
  code,
  targetLine,
  startLine,
  filePath,
  className,
}) => {
  const [copied, setCopied] = useState(false);

  const lines = code ? code.split("\n") : [];

  const baseStart =
    typeof startLine === "number" && startLine > 0
      ? startLine
      : lines.length === 1
      ? targetLine
      : Math.max(1, targetLine - Math.floor(lines.length / 3));

  const handleCopy = () => {
    if (navigator?.clipboard && code) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className={clsx(
        "rounded-2xl border border-[#292D2A] bg-[#080909] overflow-hidden font-mono text-xs shadow-md",
        className
      )}
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#151716] border-b border-[#292D2A] select-none">
        <div className="flex items-center gap-2 text-[#F4F5F4] truncate">
          <FileCode className="w-3.5 h-3.5 text-[#8CFF8C] shrink-0" />
          <span className="truncate text-[11px] font-mono">
            {filePath || "Source Context"}
          </span>
          <span className="text-[#666C68] text-[10px] hidden sm:inline">
            (Target: Line {targetLine})
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-[#A5AAA6] hover:text-[#F4F5F4] hover:bg-white/[0.04] transition-colors cursor-pointer"
          title="Copy code to clipboard"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-[#8CFF8C]" />
              <span className="text-[#8CFF8C]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Display Table */}
      <div className="overflow-x-auto p-2">
        <table className="w-full border-collapse font-mono text-xs">
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td className="p-4 text-center text-[#666C68]">
                  No source context available.
                </td>
              </tr>
            ) : (
              lines.map((lineText, idx) => {
                const currentLineNum = baseStart + idx;
                const isTarget = currentLineNum === targetLine;

                return (
                  <tr
                    key={idx}
                    className={clsx(
                      "transition-colors",
                      isTarget
                        ? "bg-[#FF5555]/10 border-l-2 border-[#FF5555] text-[#FFA3A3]"
                        : "hover:bg-white/[0.02]"
                    )}
                  >
                    {/* Line number gutter */}
                    <td
                      className={clsx(
                        "w-12 select-none px-3 py-0.5 text-right font-mono text-[11px] shrink-0",
                        isTarget
                          ? "text-[#FF5555] font-bold"
                          : "text-[#666C68]"
                      )}
                    >
                      {currentLineNum}
                    </td>

                    {/* Code line content */}
                    <td className="px-4 py-0.5 whitespace-pre font-mono leading-relaxed">
                      {isTarget && (
                        <span className="text-[#FF5555] text-[10px] font-bold mr-2 uppercase tracking-wide">
                          [VULNERABLE]
                        </span>
                      )}
                      {highlightSyntax(lineText)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
