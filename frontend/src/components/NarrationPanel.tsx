"use client";

import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface NarrationPanelProps {
  narrative: string;
}

export function NarrationPanel({ narrative }: NarrationPanelProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const displayedTextRef = useRef(displayedText);
  const historyRef = useRef(history);

  // Keep refs in sync for the interval closure
  useEffect(() => {
    displayedTextRef.current = displayedText;
  }, [displayedText]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  // Typewriter effect for new narratives
  useEffect(() => {
    if (!narrative || narrative === displayedTextRef.current) return;

    if (displayedTextRef.current && !historyRef.current.includes(displayedTextRef.current)) {
      setHistory(prev => [displayedTextRef.current, ...prev].slice(0, 50));
    }

    let i = 0;
    setDisplayedText("");

    const intervalId = setInterval(() => {
      setDisplayedText(narrative.substring(0, i + 1));
      i++;
      if (i >= narrative.length) clearInterval(intervalId);
    }, 20); // ms per character typing speed

    return () => clearInterval(intervalId);
  }, [narrative]);

  const layoutTransition = {
    layout: {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1]
    } as const
  };

  return (
    <div className="w-full h-full flex flex-col gap-5">

      {/* Scene Synthesis Stream (Current Narrative Card) */}
      <motion.div 
        layout 
        transition={layoutTransition.layout}
        className="backdrop-blur-3xl bg-[#1C1C1E]/60 border border-white/[0.04] shadow-[0_4px_30px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.05)] rounded-3xl p-6 flex flex-col gap-4 relative z-10"
      >
        <div className="flex items-center gap-2 text-[#0A84FF] font-semibold text-xs tracking-widest uppercase mb-2">
          {/* Apple hybrid sparkles SVG */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#0A84FF] animate-pulse">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
          <h2 className="tracking-widest font-bold">Scene Synthesis</h2>
        </div>

        <div className="min-h-[120px] flex flex-col justify-center">
          <AnimatePresence mode="wait">
            {displayedText ? (
              <motion.p
                key="content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-white leading-relaxed text-sm md:text-base font-medium tracking-tight"
              >
                {displayedText}
              </motion.p>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex items-center justify-center text-[#8E8E93] italic text-xs tracking-widest"
              >
                Waiting for stream synthesis...
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Historical Insights scroll container */}
      <motion.div 
        layout 
        transition={layoutTransition.layout}
        className="flex-1 backdrop-blur-3xl bg-[#1C1C1E]/60 border border-white/[0.04] shadow-[0_4px_30px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.05)] rounded-3xl p-6 overflow-y-auto custom-scrollbar flex flex-col gap-4 relative z-10 max-h-[60vh]"
      >
        <div className="flex items-center gap-2 text-[#8E8E93] font-semibold text-xs tracking-widest uppercase mb-2 sticky top-0 bg-transparent backdrop-blur-md z-10 py-1 border-b border-white/[0.04] w-full">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8v4l3 3"></path>
            <circle cx="12" cy="12" r="9"></circle>
          </svg>
          <h3 className="tracking-widest font-bold">Temporal Memory Log</h3>
        </div>

        <div className="relative border-l-2 border-white/[0.04] ml-2 pl-6 flex flex-col gap-6 mt-4">
          <AnimatePresence>
            {history.map((hist, idx) => (
              <motion.div
                key={`${idx}-${hist.substring(0, 10)}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                style={{ contentVisibility: "auto", containIntrinsicSize: "0 80px" }}
                className="relative flex flex-col gap-2 group"
              >
                {/* Timeline node glowing circle */}
                <span className="absolute -left-[32px] top-1 w-3 h-3 rounded-full bg-[#0A84FF] border-2 border-[#1C1C1E] shadow-[0_0_6px_rgba(10,132,255,0.8)] group-hover:scale-125 transition-transform" />

                {/* Time Indicator */}
                <span className="text-[9px] font-mono font-bold text-[#8E8E93] tracking-widest uppercase">
                  T - {idx * 4}S AGO
                </span>

                {/* Narrative block */}
                <div className="bg-[#2C2C2E]/30 border border-white/[0.02] p-4 rounded-2xl text-xs text-[#E5E5EA] shadow-inner tracking-tight font-medium hover:border-white/[0.08] transition-all duration-300">
                  {hist}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {history.length === 0 && (
            <div className="text-center text-[#8E8E93] text-xs py-8 tracking-widest italic font-medium -ml-4">
              No historical insights generated yet.
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
