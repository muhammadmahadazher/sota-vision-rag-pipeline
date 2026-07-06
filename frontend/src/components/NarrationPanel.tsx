"use client";

import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, MessageSquare } from "lucide-react";

interface NarrationPanelProps {
  narrative: string;
}

export function NarrationPanel({ narrative }: NarrationPanelProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const displayedTextRef = useRef(displayedText);
  const historyRef = useRef(history);

  // Keep refs in sync for the interval closure without triggering exhaustive-deps on them
  useEffect(() => {
    displayedTextRef.current = displayedText;
  }, [displayedText]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  // Simple typewriter effect for new narratives
  useEffect(() => {
    if (!narrative || narrative === displayedTextRef.current) return;

    if (displayedTextRef.current && !historyRef.current.includes(displayedTextRef.current)) {
      setHistory(prev => [displayedTextRef.current, ...prev].slice(0, 10)); // keep last 10
    }

    let i = 0;
    setDisplayedText("");

    const intervalId = setInterval(() => {
      setDisplayedText(narrative.substring(0, i + 1));
      i++;
      if (i >= narrative.length) clearInterval(intervalId);
    }, 20); // ms per char

    return () => clearInterval(intervalId);
  }, [narrative]);

  return (
    <div className="w-full h-full max-h-[80vh] flex flex-col gap-4">

      {/* Current Narrative Card */}
      <div className="glass-panel rounded-3xl p-6 flex flex-col gap-4 shadow-xl border-t border-white/20">
        <div className="flex items-center gap-2 text-blue-500 font-semibold mb-2">
          <Sparkles className="w-5 h-5" />
          <h2>Scene Synthesis</h2>
        </div>

        <div className="min-h-[120px]">
          <AnimatePresence mode="wait">
            {displayedText ? (
              <motion.p
                key="content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-foreground/90 leading-relaxed text-sm md:text-base font-medium"
              >
                {displayedText}
              </motion.p>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex items-center justify-center text-foreground/40 italic text-sm"
              >
                Waiting for stream synthesis...
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Historical Context List */}
      <div className="flex-1 glass-panel rounded-3xl p-6 overflow-y-auto custom-scrollbar flex flex-col gap-4">
        <div className="flex items-center gap-2 text-foreground/70 font-semibold mb-2 sticky top-0 bg-background/5 backdrop-blur-sm z-10 py-1">
          <MessageSquare className="w-4 h-4" />
          <h3 className="text-sm">Historical Insights</h3>
        </div>

        <div className="flex flex-col gap-3">
          <AnimatePresence>
            {history.map((hist, idx) => (
              <motion.div
                key={`${idx}-${hist.substring(0, 10)}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="bg-black/5 dark:bg-white/5 p-4 rounded-2xl text-sm text-foreground/80 border border-black/5 dark:border-white/5"
              >
                {hist}
              </motion.div>
            ))}
          </AnimatePresence>

          {history.length === 0 && (
            <div className="text-center text-foreground/40 text-sm mt-4">
              No history yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
