"use client";

import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, MessageSquare, Search, Loader2 } from "lucide-react";

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

  const handleQuerySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsQuerying(true);
    setQueryResult(null);

    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: query }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch query results");
      }

      const data = await response.json();
      setQueryResult(data);
    } catch (error) {
      console.error("Query error:", error);
      // In a real app we might set an error state here
    } finally {
      setIsQuerying(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col gap-4">

      {/* Floating Chat Input Box */}
      <motion.div layout className="glass-panel backdrop-blur-xl border border-white/10 dark:border-black/20 shadow-2xl rounded-full p-2 w-full max-w-lg mx-auto sticky top-0 z-20">
        <form onSubmit={handleQuerySubmit} className="flex items-center gap-2 px-2">
          <Search className="w-5 h-5 text-foreground/50 ml-2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Conversational Search (e.g. 'Find the woman with the handbag')"
            className="flex-1 bg-transparent border-none outline-none text-sm p-2 text-foreground placeholder:text-foreground/40"
            disabled={isQuerying}
          />
          <button
            type="submit"
            disabled={isQuerying || !query.trim()}
            className="px-4 py-1.5 rounded-full bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[80px]"
          >
            {isQuerying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
          </button>
        </form>
      </motion.div>

      {/* Query Results */}
      <AnimatePresence mode="popLayout">
        {queryResult && (
          <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="glass-panel backdrop-blur-xl border border-white/10 dark:border-black/20 shadow-2xl rounded-3xl p-6 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2 text-purple-500 font-semibold">
                <Search className="w-5 h-5" />
                <h2>Search Results</h2>
              </div>
              <button
                onClick={() => setQueryResult(null)}
                className="text-xs text-foreground/50 hover:text-foreground transition-colors"
              >
                Clear
              </button>
            </div>

            <p className="text-sm font-medium leading-relaxed">
              {queryResult.historical_summary}
            </p>

            {queryResult.timestamps.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-foreground/60 mb-2">Match Timestamps:</p>
                <div className="flex flex-wrap gap-2">
                  {queryResult.timestamps.map((ts, idx) => (
                    <span key={idx} className="px-2 py-1 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-md text-xs border border-purple-500/20">
                      {ts.toFixed(2)}s
                    </span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Current Narrative Card */}
      <motion.div layout className="glass-panel backdrop-blur-xl border border-white/10 dark:border-black/20 shadow-xl rounded-3xl p-6 flex flex-col gap-4 relative z-10">
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
      </motion.div>

      {/* Historical Context List */}
      <motion.div layout className="flex-1 glass-panel backdrop-blur-xl border border-white/10 dark:border-black/20 shadow-xl rounded-3xl p-6 overflow-y-auto custom-scrollbar flex flex-col gap-4 relative z-10 max-h-[50vh]">
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
                className="bg-black/5 dark:bg-white/5 p-4 rounded-2xl text-sm text-foreground/80 border border-black/5 dark:border-white/5 shadow-sm"
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
      </motion.div>
    </div>
  );
}
