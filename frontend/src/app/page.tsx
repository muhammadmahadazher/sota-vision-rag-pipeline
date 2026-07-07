"use client";

import { useState, useCallback } from "react";
import { StreamController } from "@/components/StreamController";
import { NarrationPanel } from "@/components/NarrationPanel";
import { motion } from "framer-motion";

export default function Home() {
  const [narrative, setNarrative] = useState<string>("");

  const handleNarrativeUpdate = useCallback((n: string) => {
    setNarrative(n);
  }, []);

  return (
    <main className="min-h-screen bg-[#000000] text-white p-6 md:p-10 lg:p-14 font-sans relative overflow-hidden flex flex-col items-center">
      
      {/* Decorative header */}
      <header className="mb-12 flex flex-col items-center justify-center text-center relative z-10 w-full max-w-4xl">
        
        {/* Minimalist Iridescent Brand Logo SVG in Apple Tones */}
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="mb-5 drop-shadow-[0_0_15px_rgba(255,255,255,0.15)]">
          <circle cx="24" cy="24" r="20" stroke="url(#logo_grad_1)" strokeWidth="2" strokeLinecap="round" strokeDasharray="5 5" className="animate-[spin_60s_linear_infinite]" />
          <path d="M24 10C16.27 10 10 16.27 10 24C10 31.73 16.27 38 24 38C31.73 38 38 31.73 38 24C38 16.27 31.73 10 24 10ZM24 32C19.58 32 16 28.42 16 24C16 19.58 19.58 16 24 16C28.42 16 32 19.58 32 24C32 28.42 28.42 32 24 32Z" fill="url(#logo_grad_2)"/>
          <circle cx="24" cy="24" r="4" fill="#0A84FF" />
          <defs>
            <linearGradient id="logo_grad_1" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0A84FF"/>
              <stop offset="0.5" stopColor="#FFFFFF"/>
              <stop offset="1" stopColor="#0A84FF"/>
            </linearGradient>
            <linearGradient id="logo_grad_2" x1="10" y1="10" x2="38" y2="38" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FFFFFF"/>
              <stop offset="1" stopColor="#2C2C2E"/>
            </linearGradient>
          </defs>
        </svg>

        {/* Live status badge with custom SVG status indicator */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.04] bg-[#1C1C1E]/80 text-[10px] font-semibold text-[#0A84FF] tracking-widest uppercase mb-4 backdrop-blur-3xl shadow-md">
          <svg width="6" height="6" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative mr-0.5">
            <circle cx="5" cy="5" r="4" fill="#0A84FF" />
            <circle cx="5" cy="5" r="4" stroke="#0A84FF" strokeWidth="1.5" className="animate-ping absolute inset-0 opacity-60" />
          </svg>
          Live Stream
        </div>

        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-white/70">
          AETHER VISION RAG
        </h1>
        <p className="mt-3 text-[#8E8E93] max-w-lg mx-auto text-xs md:text-sm font-medium leading-relaxed tracking-tight">
          State-of-the-art multimodal real-time scene synthesis. Stream camera input or drag video files to synthesize continuous intelligence narratives.
        </p>
      </header>

      {/* Main dashboard grid */}
      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">

        {/* Left column: Video Stream (Takes up 8 cols on large screens) */}
        <motion.div 
          layout 
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-8 flex flex-col"
        >
          <StreamController onNarrativeUpdate={handleNarrativeUpdate} />
        </motion.div>

        {/* Right column: Narration Panel (Takes up 4 cols on large screens) */}
        <motion.div 
          layout 
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-4 flex flex-col"
        >
          <NarrationPanel narrative={narrative} />
        </motion.div>

      </div>
    </main>
  );
}

