export type NavigationTab =
  | "dashboard"
  | "scan"
  | "repositories"
  | "findings"
  | "history"
  | "pull-requests"
  | "reports"
  | "settings";

export interface NavItemConfig {
  id: NavigationTab;
  label: string;
  icon: string;
  badge?: string | number;
}
