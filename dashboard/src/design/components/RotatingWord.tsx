import React, { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/**
 * Cycles through `words` every `interval` ms with a fade + slide crossfade.
 * Respects prefers-reduced-motion (plain swap, no transform).
 */
export default function RotatingWord({
  words,
  interval = 2000,
  className = "",
}: {
  words: string[];
  interval?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    const timer = window.setInterval(
      () => setIndex((i) => (i + 1) % words.length),
      interval
    );
    return () => window.clearInterval(timer);
  }, [words.length, interval]);

  const word = words[index];

  if (reduce) {
    return <span className={className}>{word}</span>;
  }

  return (
    <span className={`relative inline-block ${className}`} aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={word}
          initial={{ opacity: 0, y: "55%" }}
          animate={{ opacity: 1, y: "0%" }}
          exit={{ opacity: 0, y: "-55%" }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="inline-block text-mint"
        >
          {word}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
