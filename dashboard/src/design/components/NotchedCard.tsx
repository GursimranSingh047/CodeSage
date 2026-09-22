import React from "react";

export type NotchCorner = "top-right" | "top-left" | "bottom-left" | "bottom-right" | "both";

const CLIP: Record<NotchCorner, string> = {
  "top-right": "polygon(0 0, calc(100% - 24px) 0, 100% 24px, 100% 100%, 0 100%)",
  "top-left": "polygon(24px 0, 100% 0, 100% 100%, 0 100%, 0 24px)",
  "bottom-left": "polygon(0 0, 100% 0, 100% calc(100% - 24px), calc(100% - 24px) 100%, 0 100%)",
  "bottom-right": "polygon(0 0, 100% 0, 100% 100%, 24px 100%, 0 calc(100% - 24px))",
  both: "polygon(0 0, calc(100% - 24px) 0, 100% 24px, 100% calc(100% - 24px), calc(100% - 24px) 100%, 0 100%, 0 24px)",
};

/**
 * Card with one diagonally notched corner and a thin green outline that
 * follows the notch. Implemented as a two-layer clip: the outer layer paints
 * the border color, the inner layer (inset by 1px) paints the surface.
 */
export default function NotchedCard({
  corner = "top-right",
  className = "",
  innerClassName = "",
  children,
  style,
}: {
  corner?: NotchCorner;
  className?: string;
  innerClassName?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const clip = CLIP[corner];
  return (
    <div className={`bg-edge ${className}`} style={{ clipPath: clip, ...style }}>
      <div className={`bg-surface m-px h-full w-full ${innerClassName}`} style={{ clipPath: clip }}>
        {children}
      </div>
    </div>
  );
}
