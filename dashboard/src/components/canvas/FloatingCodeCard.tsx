import React from "react";
import { motion } from "framer-motion";
import { Check, ShieldCheck, Loader2 } from "lucide-react";

export const FloatingCodeCard: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15, rotateX: 6, rotateY: -8 }}
      animate={{ opacity: 1, y: 0, rotateX: 3, rotateY: -4 }}
      whileHover={{ scale: 1.02, rotateX: 0, rotateY: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      style={{ perspective: 1200 }}
      className="relative w-full max-w-lg rounded-2xl bg-[#101211]/90 backdrop-blur-xl border border-[#292D2A] shadow-elevated p-5 select-none overflow-hidden"
    >
      {/* Ambient green inner glow reflection */}
      <div className="absolute top-0 right-0 w-44 h-44 bg-[#8CFF8C]/[0.05] rounded-full blur-2xl pointer-events-none" />

      {/* Code Window Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#292D2A]">
        <div className="flex items-center gap-2">
          <span className="text-[#666C68] hover:text-[#A5AAA6] cursor-pointer text-xs">✕</span>
          <span className="font-mono text-xs text-[#A5AAA6] tracking-tight">
            src/api/user.py
          </span>
        </div>
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#151716] border border-[#292D2A] text-[11px] font-mono text-[#8CFF8C]">
          <Loader2 className="w-3 h-3 animate-spin text-[#8CFF8C]" />
          <span>Analyzing...</span>
        </div>
      </div>

      {/* Code Lines with SQL Injection -> Parameterized query */}
      <div className="font-mono text-xs leading-relaxed space-y-1.5 overflow-x-auto text-[#A5AAA6]">
        <div className="flex items-center gap-3 text-[#666C68]">
          <span className="w-7 text-right select-none opacity-60">118</span>
          <span className="text-[#F4F5F4]">def get_user(request):</span>
        </div>

        <div className="flex items-center gap-3 text-[#666C68]">
          <span className="w-7 text-right select-none opacity-60">119</span>
          <span className="text-[#A5AAA6] pl-4">user_id = request.GET.get(&quot;id&quot;)</span>
        </div>

        {/* Vulnerable line (Red) */}
        <div className="flex items-center justify-between px-2 py-1 rounded bg-[#FF5555]/10 border-l-2 border-[#FF5555] text-[#FFA3A3]">
          <div className="flex items-center gap-3">
            <span className="w-7 text-right select-none text-[#FF5555]">120</span>
            <span className="pl-4">
              <span className="text-[#FF5555] font-bold mr-1">&gt;</span>
              query = f&quot;SELECT * FROM users WHERE id = &#123;user_id&#125;&quot;
            </span>
          </div>
          <span className="text-[#FF5555] text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#FF5555]/20">
            ⚠ SQLi
          </span>
        </div>

        <div className="flex items-center gap-3 text-[#666C68]">
          <span className="w-7 text-right select-none opacity-60">121</span>
          <span className="text-[#A5AAA6] pl-4">return db.execute(query)</span>
        </div>

        {/* Fixed line (Green) */}
        <div className="flex items-center justify-between px-2 py-1 rounded bg-[#8CFF8C]/10 border-l-2 border-[#8CFF8C] text-[#C2FFC2]">
          <div className="flex items-center gap-3">
            <span className="w-7 text-right select-none text-[#8CFF8C]">122</span>
            <span className="pl-4">
              <span className="text-[#8CFF8C] font-bold mr-1">+</span>
              query = &quot;SELECT * FROM users WHERE id = %s&quot;
            </span>
          </div>
          <Check className="w-3.5 h-3.5 text-[#8CFF8C]" />
        </div>

        <div className="flex items-center gap-3 text-[#666C68]">
          <span className="w-7 text-right select-none opacity-60">123</span>
          <span className="text-[#A5AAA6] pl-4">return db.execute(query, (user_id,))</span>
        </div>
      </div>

      {/* Floating Status Badge at Bottom Right */}
      <div className="mt-4 pt-3 border-t border-[#292D2A] flex items-center justify-between">
        <span className="text-[11px] font-mono text-[#666C68]">
          AST Taint Analysis · 100% Verified
        </span>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#16351F] border border-[#8CFF8C]/40 text-[#8CFF8C] font-mono text-xs font-semibold shadow-[0_0_12px_rgba(140,255,140,0.2)]">
          <ShieldCheck className="w-3.5 h-3.5 text-[#8CFF8C]" />
          <span>Secured ✓</span>
        </div>
      </div>
    </motion.div>
  );
};
