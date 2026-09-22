import React from "react";

export type NotchCorner = "top-right" | "top-left" | "bottom-left" | "bottom-right";

const CLIP: Record<NotchCorner, string> = {
  "top-right": "polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%)",
  "top-left": "polygon(18px 0, 100% 0, 100% 100%, 0 100%, 0 18px)",
  "bottom-left": "polygon(0 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%)",
  "bottom-right": "polygon(0 0, 100% 0, 100% 100%, 18px 100%, 0 calc(100% - 18px))",
};

/**
 * Notched action button. variant:
 *  - "primary": solid mint, black text
 *  - "secondary": dark outlined, light text
 */
export default function NotchedButton({
  variant = "primary",
  corner = "top-right",
  className = "",
  children,
  ...rest
}: {
  variant?: "primary" | "secondary";
  corner?: NotchCorner;
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const clip = CLIP[corner];
  const base =
    "inline-flex items-center justify-center gap-2 px-5 py-2.5 text-[13.5px] font-semibold transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:opacity-40 disabled:cursor-not-allowed";
  const skin =
    variant === "primary"
      ? "bg-mint text-black hover:bg-[#a5ffd0] active:bg-[#7fe9a6]"
      : "bg-[#0f120f] text-ink border border-edge hover:border-edge-strong hover:bg-overlay";
  return (
    <button type="button" className={`${base} ${skin} ${className}`} style={{ clipPath: clip }} {...rest}>
      {children}
    </button>
  );
}
