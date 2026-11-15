import {
  Finding,
  FindingArtifacts,
  RepositoryValidationResult,
  ScanEvent,
  ScanHistoryItem,
  ScanRequestPayload,
  ScanRun,
} from "@/types";

const BASE_URL = import.meta.env.VITE_API_URL || "";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorDetail = `Request failed with status ${response.status}`;
    try {
      const errorJson = await response.json();
      if (errorJson.detail) {
        errorDetail = errorJson.detail;
      }
    } catch {
      // Non-JSON error body
    }
    throw new ApiError(response.status, errorDetail);
  }

  return response.json();
}

export const api = {
  /** Initiate a new scan */
  startScan: (payload: ScanRequestPayload): Promise<{ scan_id: string; status: string; message: string }> => {
    return request("/scan", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Fetch status and metrics of a scan */
  getScanStatus: (scanId: string): Promise<ScanRun> => {
    return request(`/scan/${scanId}/status`);
  },

  /** Fetch completed and in-progress findings */
  getScanFindings: (scanId: string): Promise<{ completed: Finding[]; current_finding: Finding | null }> => {
    return request(`/scan/${scanId}/findings`);
  },

  /** Fetch full event replay for a scan (REST fallback) */
  getScanEvents: (scanId: string): Promise<{ events: ScanEvent[] }> => {
    return request(`/scan/${scanId}/events`);
  },

  /** Fetch stage artifacts for a specific finding (context, triage, patch, verification) */
  getFindingArtifacts: (
    scanId: string,
    findingId: string
  ): Promise<FindingArtifacts> => {
    return request(`/scan/${scanId}/findings/${encodeURIComponent(findingId)}/artifacts`);
  },

  /** Fetch Markdown audit report for a scan */
  getScanReport: async (scanId: string): Promise<string> => {
    const response = await fetch(`${BASE_URL}/scan/${scanId}/report`);
    if (!response.ok) {
      throw new ApiError(response.status, `Failed to fetch report for scan ${scanId}`);
    }
    return response.text();
  },

  /** Request cancellation of an active or queued scan */
  cancelScan: (scanId: string): Promise<{ scan_id: string; status: string; message: string; cancelled: boolean }> => {
    return request(`/scan/${scanId}/cancel`, {
      method: "POST",
    });
  },

  /** Review a finding escalated to human review (approve or reject) */
  reviewFinding: (
    scanId: string,
    findingId: string,
    payload: { decision: "approved" | "rejected"; notes?: string; manual_patch?: string }
  ): Promise<{ status: string; finding_id: string; review_status: string; review_notes?: string }> => {
    return request(`/scan/${scanId}/findings/${encodeURIComponent(findingId)}/review`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Create a real GitHub Pull Request for a verified finding remediation */
  createPullRequest: (
    scanId: string,
    findingId: string
  ): Promise<{
    success: boolean;
    pr_number: number;
    pr_url: string;
    branch: string;
    base_branch: string;
    finding_id: string;
    status: string;
    title: string;
  }> => {
    return request(`/scan/${scanId}/findings/${encodeURIComponent(findingId)}/create-pr`, {
      method: "POST",
    });
  },

  /** Submit review decision alias for backward compatibility */
  submitReviewDecision: (
    scanId: string,
    findingId: string,
    decision: "approved" | "rejected",
    notes?: string
  ): Promise<{ status: string; finding_id: string; review_status: string; review_notes?: string }> => {
    return api.reviewFinding(scanId, findingId, { decision, notes });
  },

  /** List previous scan runs */
  listScans: (): Promise<{ scans: ScanHistoryItem[] }> => {
    return request("/scans");
  },

  /** Validate repository URL and retrieve metadata prior to scanning */
  validateRepository: (
    url: string,
    branch?: string,
    token?: string
  ): Promise<RepositoryValidationResult> => {
    const params = new URLSearchParams({ url });
    if (branch) params.append("branch", branch);
    if (token) params.append("token", token);
    return request(`/api/repositories/validate?${params.toString()}`);
  },
};

export const codesageApi = api;
