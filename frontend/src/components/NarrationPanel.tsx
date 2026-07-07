"use client";

import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface NarrationPanelProps {
  narrative: string;
}

interface QueryResult {
  timestamps: number[];
  bounding_boxes: number[][];
  historical_summary: string;
  parsed_tokens: Record<string, unknown>;
}

export function NarrationPanel({ narrative }: NarrationPanelProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const displayedTextRef = useRef(displayedText);
  const historyRef = useRef(history);

  // Conversational Search State
  const [query, setQuery] = useState("");
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  // Keep refs in sync for the interval closure
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

  const handleQuerySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsQuerying(true);
    setQueryResult(null);
    setQueryError(null);

    try {
      const response = await fetch("http://127.0.0.1:8000/api/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: query }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch query results. Check API connection.");
      }

      const data = await response.json();
      setQueryResult(data);
    } catch (error) {
      console.error("Query error:", error);
      const message = error instanceof Error ? error.message : "Failed to retrieve query results. Ensure your local backend server is running on port 8000.";
      setQueryError(message);
    } finally {
      setIsQuerying(false);
    }
  };

  const layoutTransition = {
    layout: {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1]
    } as const
  };

  return (
    <div className="w-full h-full flex flex-col gap-5">

      {/* Floating Chat Input Box */}
      <motion.div 
        layout 
        transition={layoutTransition.layout}
        className="glass-panel backdrop-blur-2xl border border-white/[0.08] shadow-[0_12px_40px_rgba(0,0,0,0.5)] bg-white/[0.02] rounded-full p-1.5 w-full max-w-lg mx-auto sticky top-0 z-20 group focus-within:border-cyan-500/30 focus-within:shadow-[0_0_20px_rgba(6,182,212,0.15)] transition-all duration-300"
      >
        <form onSubmit={handleQuerySubmit} className="flex items-center gap-2 px-2">
          {/* Sleek inline search SVG */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/40 ml-2 group-focus-within:text-cyan-400 transition-colors">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            id="input-conversational-query"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Conversational Search..."
            className="flex-1 bg-transparent border-none outline-none text-xs p-2 text-white placeholder:text-white/30"
            disabled={isQuerying}
          />
          <button
            id="btn-query-submit"
            type="submit"
            disabled={isQuerying || !query.trim()}
            className="px-5 py-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-semibold uppercase tracking-wider hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center min-w-[90px] shadow-md border border-cyan-400/10 active:scale-95"
          >
            {isQuerying ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="animate-spin text-white">
                <line x1="12" y1="2" x2="12" y2="6"></line>
                <line x1="12" y1="18" x2="12" y2="22"></line>
                <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                <line x1="2" y1="12" x2="6" y2="12"></line>
                <line x1="18" y1="12" x2="22" y2="12"></line>
                <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
              </svg>
            ) : "Search"}
          </button>
        </form>
      </motion.div>

      {/* Network / Error Notice */}
      <AnimatePresence>
        {queryError && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="w-full max-w-lg mx-auto bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-red-400 text-xs flex items-center gap-3 shadow-md backdrop-blur-md"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-red-400">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <p className="flex-1">{queryError}</p>
            <button
              onClick={() => setQueryError(null)}
              className="text-red-400/60 hover:text-red-400 transition-colors cursor-pointer text-[10px] uppercase font-bold tracking-wider"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Historical Analytics Search (Query Results) */}
      <AnimatePresence mode="popLayout">
        {queryResult && (
          <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={layoutTransition.layout}
            className="glass-panel backdrop-blur-2xl border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.6)] bg-white/[0.02] rounded-3xl p-6 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2 text-cyan-400 font-semibold text-sm tracking-wider uppercase">
                {/* Search result icon */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <h2>Search Results</h2>
              </div>
              <button
                id="btn-clear-query"
                onClick={() => setQueryResult(null)}
                className="text-[10px] text-white/50 hover:text-white transition-colors cursor-pointer uppercase font-bold tracking-wider"
              >
                Clear
              </button>
            </div>

            <p className="text-white/90 leading-relaxed text-sm font-medium">
              {queryResult.historical_summary}
            </p>

            {queryResult.timestamps.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] uppercase tracking-wider font-bold text-white/40 mb-2">Match Timestamps:</p>
                <div className="flex flex-wrap gap-1.5">
                  {queryResult.timestamps.map((ts, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-cyan-500/10 text-cyan-400 rounded-md text-xs font-semibold border border-cyan-500/20 shadow-sm backdrop-blur-sm">
                      {ts.toFixed(2)}s
                    </span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scene Synthesis Stream (Current Narrative Card) */}
      <motion.div 
        layout 
        transition={layoutTransition.layout}
        className="glass-panel backdrop-blur-2xl border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.6)] bg-white/[0.02] rounded-3xl p-6 flex flex-col gap-4 relative z-10"
      >
        <div className="flex items-center gap-2 text-cyan-400 font-semibold text-sm tracking-wider uppercase mb-2">
          {/* Sparkles / Stream icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400 animate-pulse">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
          <h2>Scene Synthesis</h2>
        </div>

        <div className="min-h-[100px] flex flex-col justify-center">
          <AnimatePresence mode="wait">
            {displayedText ? (
              <motion.p
                key="content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-white/95 leading-relaxed text-sm md:text-base font-medium"
              >
                {displayedText}
              </motion.p>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex items-center justify-center text-white/30 italic text-xs tracking-wider"
              >
                Waiting for stream synthesis...
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Historical Analytics Search (Historical Context List) */}
      <motion.div 
        layout 
        transition={layoutTransition.layout}
        className="flex-1 glass-panel backdrop-blur-2xl border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.6)] bg-white/[0.02] rounded-3xl p-6 overflow-y-auto custom-scrollbar flex flex-col gap-4 relative z-10 max-h-[45vh]"
      >
        <div className="flex items-center gap-2 text-white/50 font-semibold text-sm tracking-wider uppercase mb-2 sticky top-0 bg-transparent backdrop-blur-sm z-10 py-1 border-b border-white/[0.05]">
          {/* Historical icon */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8v4l3 3"></path>
            <circle cx="12" cy="12" r="9"></circle>
          </svg>
          <h3 className="text-xs">Historical Insights</h3>
        </div>

        <div className="flex flex-col gap-3">
          <AnimatePresence>
            {history.map((hist, idx) => (
              <motion.div
                key={`${idx}-${hist.substring(0, 10)}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-white/[0.01] border border-white/[0.04] p-4 rounded-2xl text-xs text-white/80 shadow-inner"
              >
                {hist}
              </motion.div>
            ))}
          </AnimatePresence>

          {history.length === 0 && (
            <div className="text-center text-white/20 text-xs py-8 tracking-wider italic">
              No historical insights generated yet.
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

