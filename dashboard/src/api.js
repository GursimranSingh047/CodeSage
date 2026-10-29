// REST + WebSocket client for the CodeSage backend.

export async function startScan(repoUrl, githubRepo, scanners, branch, githubToken) {
  const body = {
    repo_url: repoUrl,
    repository_url: repoUrl,
    scanners: scanners || ["semgrep", "bandit", "gitleaks"],
  };
  if (githubRepo) body.github_repo = githubRepo;
  if (branch) body.branch = branch;
  if (githubToken) body.github_token = githubToken;

  const resp = await fetch("/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(detail.detail || `POST /scan failed (${resp.status})`);
  }
  return resp.json(); // {scan_id, status}
}

export async function validateRepository(url, branch = null, token = null) {
  const params = new URLSearchParams({ url });
  if (branch) params.set("branch", branch);
  if (token) params.set("token", token);

  const resp = await fetch(`/api/repositories/validate?${params.toString()}`);
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(detail.detail || `Validation failed (${resp.status})`);
  }
  return resp.json();
}

export async function startRepositoryScan({ repositoryUrl, branch, scanners, githubToken }) {
  const body = {
    repository_url: repositoryUrl,
    repo_url: repositoryUrl,
    branch: branch || undefined,
    scanners: scanners || ["semgrep", "bandit", "gitleaks"],
    github_token: githubToken || undefined,
  };
  const resp = await fetch("/api/repositories/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(detail.detail || `POST /api/repositories/scan failed (${resp.status})`);
  }
  return resp.json();
}

export async function fetchScanReport(scanId) {
  const resp = await fetch(`/scan/${scanId}/report`);
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(detail.detail || `Failed to fetch report (${resp.status})`);
  }
  return resp.text();
}


export async function listScans() {
  const resp = await fetch("/scans");
  return resp.json();
}

export async function fetchStatus(scanId) {
  const resp = await fetch(`/scan/${scanId}/status`);
  return resp.json();
}

export async function fetchFindings(scanId) {
  const resp = await fetch(`/scan/${scanId}/findings`);
  return resp.json();
}

export async function fetchArtifacts(scanId, findingId) {
  const resp = await fetch(
    `/scan/${scanId}/findings/${encodeURIComponent(findingId)}/artifacts`
  );
  if (!resp.ok) return null;
  return resp.json();
}

// Connects to /ws/{scanId}; the server replays the full event history on
// connect, so late joiners see the same stream as live viewers.
export function connectEvents(scanId, onEvent, onOpen, onDown) {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${window.location.host}/ws/${scanId}`);
  let closed = false;

  ws.onopen = () => onOpen && onOpen();
  ws.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data));
    } catch (err) {
      console.error("bad event payload", err);
    }
  };
  ws.onclose = () => {
    if (!closed && onDown) onDown();
  };
  ws.onerror = () => ws.close();

  return () => {
    closed = true;
    ws.close();
  };
}
