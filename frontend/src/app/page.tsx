"use client";

import { useState } from "react";
import { StreamController } from "@/components/StreamController";
import { NarrationPanel } from "@/components/NarrationPanel";
import { motion } from "framer-motion";

export default function Home() {
  const [narrative, setNarrative] = useState<string>("");

  return (
    <main className="min-h-screen p-4 md:p-8 lg:p-12 font-sans relative overflow-hidden">

      {/* Decorative header */}
      <header className="mb-12 flex flex-col items-center justify-center text-center relative z-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-panel text-sm font-medium text-blue-500 mb-6">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          Live Stream
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-foreground to-foreground/50">
          Vision RAG Interface
        </h1>
        <p className="mt-4 text-foreground/60 max-w-2xl mx-auto">
          State-of-the-art multimodal real-time scene synthesis. Upload a video or use your webcam to generate continuous contextual narratives.
        </p>
      </header>

      {/* Main dashboard grid */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">

        {/* Left column: Video Stream (Takes up 8 cols on large screens) */}
        <motion.div layout className="lg:col-span-8 flex flex-col">
          <StreamController onNarrativeUpdate={(n) => setNarrative(n)} />
        </motion.div>

        {/* Right column: Narration Panel (Takes up 4 cols on large screens) */}
        <motion.div layout className="lg:col-span-4 flex flex-col">
          <NarrationPanel narrative={narrative} />
        </motion.div>

      </div>
    </main>
  );
}
