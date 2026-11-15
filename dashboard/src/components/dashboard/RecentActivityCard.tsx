import React from "react";
import { ArrowRight } from "lucide-react";

interface RecentActivityCardProps {
  onViewAll?: () => void;
}

export const RecentActivityCard: React.FC<RecentActivityCardProps> = ({ onViewAll }) => {
  const activities = [
    {
      id: "1",
      title: "Automated security scan started",
      time: "2 min ago",
      status: "active",
    },
    {
      id: "2",
      title: "AI triage completed",
      time: "3 min ago",
      status: "complete",
    },
    {
      id: "3",
      title: "Generated 2 secure fixes",
      time: "4 min ago",
      status: "complete",
    },
    {
      id: "4",
      title: "Verification passed",
      time: "5 min ago",
      status: "complete",
    },
    {
      id: "5",
      title: "Pull request #42 created",
      time: "6 min ago",
      status: "complete",
    },
  ];

  return (
    <div className="surface-card rounded-2xl p-5 space-y-4 select-none relative overflow-hidden group hover:border-[#363C38] transition-all">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="font-sans font-semibold text-sm text-[#F4F5F4] tracking-tight">
          Recent Activity
        </h4>
        <button
          type="button"
          onClick={onViewAll}
          className="text-xs font-mono text-[#A5AAA6] hover:text-[#8CFF8C] transition-colors flex items-center gap-1 cursor-pointer"
        >
          <span>View All</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Activity Timeline List */}
      <div className="space-y-3 pt-1">
        {activities.map((item) => {
          const isActive = item.status === "active";
          return (
            <div
              key={item.id}
              className="flex items-center justify-between text-xs font-sans group/item"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isActive
                      ? "bg-[#8CFF8C] animate-pulse shadow-[0_0_8px_rgba(140,255,140,0.8)]"
                      : "bg-[#292D2A] group-hover/item:bg-[#52D96B]"
                  }`}
                />
                <span className="text-[#F4F5F4] truncate text-[12px] group-hover/item:text-white transition-colors">
                  {item.title}
                </span>
              </div>
              <span className="font-mono text-[11px] text-[#666C68] shrink-0 pl-2">
                {item.time}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
