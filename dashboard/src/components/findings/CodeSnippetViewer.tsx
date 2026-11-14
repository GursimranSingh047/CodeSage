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

// Simple deterministic syntax highlighter for Python / generic code
function highlightSyntax(line: string): React.ReactNode {
  // Comments
  const commentIdx = line.indexOf("#");
  if (commentIdx !== -1) {
    const codePart = line.substring(0, commentIdx);
    const commentPart = line.substring(commentIdx);
    return (
      <>
        {highlightTokens(codePart)}
        <span className="text-sage-500 italic">{commentPart}</span>
      </>
    );
  }
  return highlightTokens(line);
}

function highlightTokens(text: string): React.ReactNode {
  // Regex to match strings and keywords
  const parts = text.split(/(".*?"|'.*?'|\b(?:def|class|return|import|from|as|if|elif|else|for|while|try|except|finally|with|raise|assert|in|is|not|and|or|None|True|False)\b)/g);

  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith('"') || part.startsWith("'")) {
      return (
        <span key={i} className="text-emerald-400">
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
        <span key={i} className="text-accent-orange font-semibold">
          {part}
        </span>
      );
    }
    if (/^\b(?:None|True|False)\b$/.test(part)) {
      return (
        <span key={i} className="text-accent-teal font-medium">
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
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

  // Determine starting line number:
  // If startLine is provided, use it. Otherwise, if code has 1 line, start at targetLine.
  // If code is multi-line enclosing function and targetLine is inside, approximate start.
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
        "rounded-xl border border-white/[0.08] bg-sage-950 overflow-hidden font-mono text-xs shadow-inner",
        className
      )}
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-sage-900/90 border-b border-white/[0.06] select-none">
        <div className="flex items-center gap-2 text-sage-300 truncate">
          <FileCode className="w-3.5 h-3.5 text-accent-teal shrink-0" />
          <span className="truncate text-[11px] font-mono">
            {filePath || "Source Context"}
          </span>
          <span className="text-sage-500 text-[10px] hidden sm:inline">
            (Target: Line {targetLine})
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-sage-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          title="Copy code to clipboard"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 text-sage-400" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Display Area */}
      <div className="overflow-x-auto py-2.5 text-xs font-mono leading-relaxed max-h-96">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((lineText, idx) => {
              const currentLineNumber = baseStart + idx;
              const isTarget = currentLineNumber === targetLine;

              return (
                <tr
                  key={idx}
                  className={clsx(
                    "transition-colors",
                    isTarget
                      ? "bg-rose-500/15 border-l-2 border-accent-orange text-white"
                      : "hover:bg-white/[0.02] text-sage-300"
                  )}
                >
                  {/* Line Number Column */}
                  <td className="w-12 select-none pr-3 text-right text-[11px] text-sage-500 font-mono align-top py-0.5 border-r border-white/[0.06]">
                    {currentLineNumber}
                  </td>

                  {/* Marker Indicator */}
                  <td className="w-6 select-none text-center align-top py-0.5">
                    {isTarget && (
                      <span className="text-accent-orange text-[10px] font-bold">
                        ▶
                      </span>
                    )}
                  </td>

                  {/* Code Line Content */}
                  <td className="pl-2 pr-4 py-0.5 whitespace-pre font-mono">
                    {highlightSyntax(lineText)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
