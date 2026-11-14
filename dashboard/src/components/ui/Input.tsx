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
          <label className="block text-xs font-mono font-medium uppercase tracking-wider text-sage-300">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-3.5 flex items-center pointer-events-none text-sage-400">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            disabled={disabled}
            className={clsx(
              "w-full bg-sage-900 border text-sage-100 placeholder-sage-500 font-sans text-sm rounded-xl transition-all focus:outline-none focus:ring-1 disabled:opacity-40 disabled:cursor-not-allowed",
              icon ? "pl-10" : "pl-3.5",
              rightElement ? "pr-12" : "pr-3.5",
              "py-2.5",
              error
                ? "border-rose-500/50 focus:border-rose-500 focus:ring-rose-500/40"
                : "border-white/[0.09] focus:border-accent-orange/50 focus:ring-accent-orange/50 hover:border-white/[0.18]",
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
          <p className="text-[11px] font-mono text-rose-400">{error}</p>
        ) : hint ? (
          <p className="text-[11px] font-mono text-sage-500">{hint}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";
