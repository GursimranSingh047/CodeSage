import React from "react";
import { FolderSearch } from "lucide-react";
import { Card } from "@/components/ui/Card";
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
    <Card className={`p-10 text-center flex flex-col items-center justify-center ${className || ""}`}>
      <div className="w-12 h-12 rounded-xl bg-sage-850 border border-white/[0.08] flex items-center justify-center text-sage-400 mb-4 shadow-sm">
        {icon || <FolderSearch className="w-6 h-6 text-sage-400" />}
      </div>
      <h3 className="font-sans font-semibold text-white text-base mb-1.5">{title}</h3>
      <p className="font-sans text-xs text-sage-400 max-w-sm leading-relaxed mb-6">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Card>
  );
};
