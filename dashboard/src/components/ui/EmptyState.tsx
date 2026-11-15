import React from "react";
import { FolderSearch } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}) => {
  return (
    <div className={`p-10 text-center flex flex-col items-center justify-center ${className || ""}`}>
      <div className="w-12 h-12 rounded-2xl bg-[#EDEDED] border border-[#B8B8B8]/40 flex items-center justify-center text-[#383838] mb-4 shadow-sm">
        {icon || <FolderSearch className="w-6 h-6 text-[#8E8E8E]" />}
      </div>
      <h3 className="font-sans font-bold text-[#383838] text-base mb-1.5">{title}</h3>
      <p className="font-sans text-xs text-[#6B6B6B] max-w-sm leading-relaxed mb-6">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant="primary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};