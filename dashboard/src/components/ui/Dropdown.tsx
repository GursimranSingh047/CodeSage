import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check } from "lucide-react";
import { clsx } from "clsx";

export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

export interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  value,
  onChange,
  label,
  placeholder = "Select option...",
  disabled = false,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={clsx("relative w-full space-y-1.5", className)}>
      {label && (
        <label className="block text-xs font-mono font-medium uppercase tracking-wider text-sage-300">
          {label}
        </label>
      )}

      {/* Dropdown Button Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={clsx(
          "w-full flex items-center justify-between px-3.5 py-2.5 bg-sage-900 border rounded-xl text-sm font-sans transition-all focus:outline-none focus:ring-1 focus:ring-accent-orange/40 disabled:opacity-40 disabled:cursor-not-allowed",
          isOpen
            ? "border-accent-orange/50 text-white"
            : "border-white/[0.09] text-sage-200 hover:border-white/[0.18]"
        )}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedOption?.icon && (
            <span className="shrink-0 text-sage-400">{selectedOption.icon}</span>
          )}
          <span className={selectedOption ? "text-sage-100" : "text-sage-500"}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>
        <ChevronDown
          className={clsx(
            "w-4 h-4 text-sage-400 transition-transform duration-200 shrink-0",
            isOpen && "rotate-180 text-accent-orange"
          )}
        />
      </button>

      {/* Animated Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute z-50 w-full mt-1.5 bg-sage-900/95 backdrop-blur-xl border border-white/[0.12] rounded-xl shadow-glass-elevated overflow-hidden py-1 max-h-60 overflow-y-auto"
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={clsx(
                    "w-full flex items-center justify-between px-3.5 py-2 text-left text-xs transition-colors font-sans",
                    isSelected
                      ? "bg-accent-orange/15 text-orange-200 font-medium"
                      : "text-sage-300 hover:bg-sage-800 hover:text-white"
                  )}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    {option.icon && (
                      <span className={isSelected ? "text-accent-orange" : "text-sage-400"}>
                        {option.icon}
                      </span>
                    )}
                    <div className="truncate">
                      <div className="truncate">{option.label}</div>
                      {option.description && (
                        <div className="text-[10px] text-sage-500 truncate">
                          {option.description}
                        </div>
                      )}
                    </div>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-accent-orange shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
