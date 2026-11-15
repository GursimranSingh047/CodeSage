import React, { useState } from "react";
import { AppShell } from "@/layouts/AppShell";
import { DashboardPage } from "@/pages/DashboardPage";
import { ScanOrchestrationPage } from "@/pages/ScanOrchestrationPage";
import { FindingsPage } from "@/pages/FindingsPage";
import { PullRequestsPage } from "@/pages/PullRequestsPage";
import { HistoryPage } from "@/pages/HistoryPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { NavigationTab } from "@/types/navigation";
import { useScan } from "@/hooks/useScan";
import { EmptyState } from "@/components/ui/EmptyState";
import { FolderGit2, Settings } from "lucide-react";

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavigationTab>("dashboard");
  const scan = useScan();

  const handleStartScan = async (repoUrl: string, branch?: string, scanners?: string[]) => {
    try {
      const id = await scan.startScan(repoUrl, branch, scanners);
      setActiveTab("scan");
      return id;
    } catch (err) {
      console.error("Scan launch error:", err);
      throw err;
    }
  };

  const handleSelectScan = (id: string) => {
    scan.loadScan(id);
    setActiveTab("scan");
  };

  return (
    <AppShell
      activeTab={activeTab}
      onTabChange={setActiveTab}
      isScanning={scan.isScanning}
      statusText={scan.isScanning ? "Scanning..." : "Engine Ready"}
      findingsCount={scan.findings.length}
    >
      {activeTab === "dashboard" && (
        <DashboardPage
          onStartScan={handleStartScan}
          onSelectScan={handleSelectScan}
          onNavigateToFindings={() => setActiveTab("findings")}
          onNavigateToPR={() => setActiveTab("pull-requests")}
          isScanning={scan.isScanning}
        />
      )}

      {activeTab === "scan" && (
        <ScanOrchestrationPage
          scanId={scan.scanId}
          repoUrl={scan.repoUrl}
          branch={scan.branch}
          status={scan.status}
          currentStageId={scan.currentStageId}
          stageStatuses={scan.stageStatuses}
          events={scan.events}
          findings={scan.findings}
          progressPercent={scan.progressPercent}
          startedAt={scan.startedAt}
          finishedAt={scan.finishedAt}
          isWsConnected={scan.isWsConnected}
          isReconnecting={scan.isReconnecting}
          isCancelling={scan.isCancelling}
          onCancelScan={scan.cancelScan}
          onBackToDashboard={() => setActiveTab("dashboard")}
          onNavigateToFindings={() => setActiveTab("findings")}
          onNavigateToPR={() => setActiveTab("pull-requests")}
        />
      )}

      {activeTab === "repositories" && (
        <div className="surface-card rounded-2xl p-8 border border-[#292D2A] max-w-2xl mx-auto">
          <EmptyState
            icon={<FolderGit2 className="w-6 h-6 text-[#8CFF8C]" />}
            title="Connected Repositories"
            description="Manage monitored codebases, scheduled background automations, and GitHub Webhook integrations."
            actionLabel="Connect GitHub Repository"
            onAction={() => setActiveTab("scan")}
          />
        </div>
      )}

      {activeTab === "findings" && (
        <FindingsPage
          initialScanId={scan.scanId}
          onNavigateToScan={(id) => {
            scan.loadScan(id);
            setActiveTab("scan");
          }}
        />
      )}

      {activeTab === "history" && (
        <HistoryPage
          onSelectScan={(id) => {
            scan.loadScan(id);
            setActiveTab("scan");
          }}
          onViewReport={(id) => {
            scan.loadScan(id);
            setActiveTab("reports");
          }}
          onViewFindings={(id) => {
            scan.loadScan(id);
            setActiveTab("findings");
          }}
          onStartNewScan={() => setActiveTab("dashboard")}
        />
      )}

      {activeTab === "pull-requests" && (
        <PullRequestsPage
          initialScanId={scan.scanId}
          onNavigateToScan={(id) => {
            scan.loadScan(id);
            setActiveTab("scan");
          }}
          onNavigateToDashboard={() => setActiveTab("dashboard")}
        />
      )}

      {activeTab === "reports" && (
        <ReportsPage
          initialScanId={scan.scanId}
          onNavigateToScan={(id) => {
            scan.loadScan(id);
            setActiveTab("scan");
          }}
          onStartNewScan={() => setActiveTab("dashboard")}
        />
      )}

      {activeTab === "settings" && (
        <div className="surface-card rounded-2xl p-8 border border-[#292D2A] max-w-2xl mx-auto">
          <EmptyState
            icon={<Settings className="w-6 h-6 text-[#A5AAA6]" />}
            title="Platform & Scanner Settings"
            description="Configure Semgrep custom rule paths, Bandit issue filters, Gitleaks regex expressions, and Docker sandbox execution policies."
            actionLabel="Back to Dashboard"
            onAction={() => setActiveTab("dashboard")}
          />
        </div>
      )}
    </AppShell>
  );
};
