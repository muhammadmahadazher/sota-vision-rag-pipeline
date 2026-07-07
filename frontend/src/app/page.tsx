"use client";

import { useState } from "react";
import { StreamController } from "@/components/StreamController";
import { NarrationPanel } from "@/components/NarrationPanel";
import { motion } from "framer-motion";

export default function Home() {
  const [narrative, setNarrative] = useState<string>("");

  return (
    <main className="min-h-screen bg-[#0A0A0C] text-white p-6 md:p-10 lg:p-14 font-sans relative overflow-hidden flex flex-col items-center">
      
      {/* Subtle Background Radial Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-500/10 blur-[120px] pointer-events-none z-0" />
      <div className="absolute top-[30%] right-[20%] w-[30%] h-[30%] rounded-full bg-blue-600/5 blur-[100px] pointer-events-none z-0" />

      {/* Decorative header */}
      <header className="mb-12 flex flex-col items-center justify-center text-center relative z-10 w-full max-w-4xl">
        
        {/* Minimalist Iridescent Brand Logo SVG */}
        <svg width="56" height="56" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="mb-6 drop-shadow-[0_0_20px_rgba(6,182,212,0.4)]">
          <circle cx="24" cy="24" r="20" stroke="url(#logo_grad_1)" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 6" className="animate-[spin_40s_linear_infinite]" />
          <path d="M24 10C16.27 10 10 16.27 10 24C10 31.73 16.27 38 24 38C31.73 38 38 31.73 38 24C38 16.27 31.73 10 24 10ZM24 32C19.58 32 16 28.42 16 24C16 19.58 19.58 16 24 16C28.42 16 32 19.58 32 24C32 28.42 28.42 32 24 32Z" fill="url(#logo_grad_2)"/>
          <circle cx="24" cy="24" r="4" fill="url(#logo_grad_1)" className="animate-pulse" />
          <defs>
            <linearGradient id="logo_grad_1" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
              <stop stopColor="#06B6D4"/>
              <stop offset="0.5" stopColor="#3B82F6"/>
              <stop offset="1" stopColor="#EC4899"/>
            </linearGradient>
            <linearGradient id="logo_grad_2" x1="10" y1="10" x2="38" y2="38" gradientUnits="userSpaceOnUse">
              <stop stopColor="#EC4899"/>
              <stop offset="1" stopColor="#06B6D4"/>
            </linearGradient>
          </defs>
        </svg>

        {/* Live status badge with custom SVG status indicator */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] text-xs font-semibold text-cyan-400 tracking-wider uppercase mb-5 backdrop-blur-md shadow-sm">
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative mr-0.5">
            <circle cx="5" cy="5" r="4" fill="#06B6D4" className="animate-pulse" />
            <circle cx="5" cy="5" r="4" stroke="#06B6D4" strokeWidth="1.5" className="animate-ping absolute inset-0 opacity-75" />
          </svg>
          Live Stream Engine
        </div>

        <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50">
          AETHER VISION RAG
        </h1>
        <p className="mt-4 text-white/50 max-w-xl mx-auto text-xs md:text-sm font-medium leading-relaxed tracking-wide">
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
          <StreamController onNarrativeUpdate={(n) => setNarrative(n)} />
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

