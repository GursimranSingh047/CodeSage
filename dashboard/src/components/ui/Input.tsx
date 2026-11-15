import React, { forwardRef } from "react";
import { clsx } from "clsx";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  rightElement?: React.ReactNode;
  error?: string;
  label?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ icon, rightElement, error, label, hint, className, disabled, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className="block text-xs font-mono font-medium tracking-wider text-[#A5AAA6] uppercase">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-3.5 flex items-center pointer-events-none text-[#666C68]">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            disabled={disabled}
            className={clsx(
              "w-full bg-[#101211] border text-[#F4F5F4] placeholder-[#666C68] font-sans text-xs rounded-xl transition-all focus:outline-none focus:ring-1 focus:ring-[#8CFF8C] focus:border-[#8CFF8C] shadow-inner disabled:opacity-40 disabled:cursor-not-allowed",
              icon ? "pl-9" : "pl-3.5",
              rightElement ? "pr-11" : "pr-3.5",
              "py-2",
              error
                ? "border-[#FF5555] focus:border-[#FF5555] focus:ring-[#FF5555]/30"
                : "border-[#292D2A] hover:border-[#363C38]",
              className
            )}
            {...props}
          />
          {rightElement && (
            <div className="absolute right-3 flex items-center">
              {rightElement}
            </div>
          )}
        </div>
        {error ? (
          <p className="text-[11px] font-mono text-[#FF5555]">{error}</p>
        ) : hint ? (
          <p className="text-[11px] font-mono text-[#666C68]">{hint}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";
