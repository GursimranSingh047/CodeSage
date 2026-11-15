export interface DiffLine {
  type: "context" | "removed" | "added";
  oldLineNumber?: number;
  newLineNumber?: number;
  text: string;
}

export interface DiffResult {
  lines: DiffLine[];
  additions: number;
  deletions: number;
  hasChanges: boolean;
}

/**
 * Computes an accurate unified line-by-line diff between originalCode and patchedCode.
 * Uses the Longest Common Subsequence (LCS) algorithm to generate context, removed (-), and added (+) lines.
 */
export function computeLineDiff(
  originalCode?: string | null,
  patchedCode?: string | null,
  startLine: number = 1
): DiffResult {
  const orig = originalCode ?? "";
  const patch = patchedCode ?? "";

  if (!orig && !patch) {
    return { lines: [], additions: 0, deletions: 0, hasChanges: false };
  }

  const origLines = orig ? orig.split("\n") : [];
  const patchLines = patch ? patch.split("\n") : [];

  // If both are strictly equal, treat as unchanged context
  if (orig === patch) {
    const lines: DiffLine[] = origLines.map((line, idx) => ({
      type: "context",
      oldLineNumber: startLine + idx,
      newLineNumber: startLine + idx,
      text: line,
    }));
    return {
      lines,
      additions: 0,
      deletions: 0,
      hasChanges: false,
    };
  }

  // Longest Common Subsequence (LCS) matrix
  const m = origLines.length;
  const n = patchLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (origLines[i] === patchLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack to build diff operations
  let i = m;
  let j = n;
  type Op = { type: "context" | "removed" | "added"; text: string };
  const ops: Op[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === patchLines[j - 1]) {
      ops.push({ type: "context", text: origLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: "added", text: patchLines[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      ops.push({ type: "removed", text: origLines[i - 1] });
      i--;
    }
  }

  ops.reverse();

  let oldLine = startLine;
  let newLine = startLine;
  let additions = 0;
  let deletions = 0;

  const lines: DiffLine[] = ops.map((op) => {
    if (op.type === "context") {
      const line: DiffLine = {
        type: "context",
        oldLineNumber: oldLine,
        newLineNumber: newLine,
        text: op.text,
      };
      oldLine++;
      newLine++;
      return line;
    } else if (op.type === "removed") {
      const line: DiffLine = {
        type: "removed",
        oldLineNumber: oldLine,
        text: op.text,
      };
      oldLine++;
      deletions++;
      return line;
    } else {
      const line: DiffLine = {
        type: "added",
        newLineNumber: newLine,
        text: op.text,
      };
      newLine++;
      additions++;
      return line;
    }
  });

  return {
    lines,
    additions,
    deletions,
    hasChanges: additions > 0 || deletions > 0,
  };
}
