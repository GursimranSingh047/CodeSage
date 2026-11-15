import React, { useEffect, useRef } from "react";

interface ComputationalFieldProps {
  className?: string;
  interactive?: boolean;
  density?: "normal" | "subtle";
}

export const ComputationalField: React.FC<ComputationalFieldProps> = ({
  className = "",
  interactive = true,
  density = "normal",
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    // Mouse parallax tracking
    let targetMouseX = 0.5;
    let targetMouseY = 0.5;
    let mouseX = 0.5;
    let mouseY = 0.5;

    const handleMouseMove = (e: MouseEvent) => {
      if (!interactive) return;
      const rect = canvas.getBoundingClientRect();
      targetMouseX = (e.clientX - rect.left) / rect.width;
      targetMouseY = (e.clientY - rect.top) / rect.height;
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };

    window.addEventListener("resize", handleResize);

    // Particle nodes on the wave
    interface Particle {
      x: number;
      waveIndex: number;
      speed: number;
      size: number;
      alpha: number;
    }

    const particleCount = density === "normal" ? 28 : 14;
    const particles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        waveIndex: Math.floor(Math.random() * 5),
        speed: 0.3 + Math.random() * 0.7,
        size: 1 + Math.random() * 2,
        alpha: 0.2 + Math.random() * 0.7,
      });
    }

    let t = 0;

    const render = () => {
      t += prefersReducedMotion ? 0.002 : 0.012;

      // Smooth mouse interpolation
      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;

      ctx.clearRect(0, 0, width, height);

      // Layered sine ribbon configuration
      const numLines = density === "normal" ? 18 : 10;
      const centerY = height * 0.52;

      for (let i = 0; i < numLines; i++) {
        const lineProgress = i / (numLines - 1);
        const yOffset = (lineProgress - 0.5) * 60;
        const opacity = Math.sin(lineProgress * Math.PI) * 0.35 + 0.05;

        ctx.beginPath();
        const step = 8;
        for (let x = 0; x <= width; x += step) {
          const normX = x / width;

          // Multi-frequency wave formula
          const wave1 = Math.sin(normX * 4.5 + t + i * 0.15) * 32;
          const wave2 = Math.sin(normX * 8.0 - t * 0.8 + i * 0.1) * 16;
          const wave3 = Math.cos(normX * 2.2 + t * 0.5) * 20;

          // Subtle cursor deflection
          const distToMouse = Math.hypot(normX - mouseX, (centerY - mouseY * height) / height);
          const mouseDeflect = Math.exp(-distToMouse * 3.5) * (mouseY - 0.5) * 40;

          // Envelope to taper edges
          const envelope = Math.sin(normX * Math.PI);
          const y = centerY + yOffset + (wave1 + wave2 + wave3 + mouseDeflect) * envelope;

          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        // Palette gradient from Deep Green (#16351F) to Bright Green (#8CFF8C)
        const isAccent = i % 4 === 0;
        if (isAccent) {
          ctx.strokeStyle = `rgba(140, 255, 140, ${opacity * 1.5})`;
          ctx.lineWidth = 1.3;
        } else {
          ctx.strokeStyle = `rgba(82, 217, 107, ${opacity * 0.8})`;
          ctx.lineWidth = 0.8;
        }
        ctx.stroke();
      }

      // Draw glowing particle nodes along the wave
      particles.forEach((p) => {
        p.x += prefersReducedMotion ? 0.1 : p.speed;
        if (p.x > width) p.x = 0;

        const normX = p.x / width;
        const envelope = Math.sin(normX * Math.PI);
        const waveY =
          centerY +
          (Math.sin(normX * 4.5 + t + p.waveIndex * 0.15) * 32 +
            Math.sin(normX * 8.0 - t * 0.8 + p.waveIndex * 0.1) * 16) *
            envelope;

        // Draw soft glow
        const glowGradient = ctx.createRadialGradient(p.x, waveY, 0, p.x, waveY, p.size * 3.5);
        glowGradient.addColorStop(0, `rgba(140, 255, 140, ${p.alpha * 0.9})`);
        glowGradient.addColorStop(1, "rgba(140, 255, 140, 0)");

        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(p.x, waveY, p.size * 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Draw core node
        ctx.fillStyle = `rgba(244, 245, 244, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, waveY, p.size * 0.7, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
    };
  }, [interactive, density]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full block pointer-events-none select-none ${className}`}
    />
  );
};
