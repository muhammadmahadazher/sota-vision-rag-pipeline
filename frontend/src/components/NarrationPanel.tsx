"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Clipboard, Clock3, Download, Search, Sparkles, Trash2 } from "lucide-react";

interface NarrationPanelProps {
  narrative: string;
}

interface MemoryEntry {
  id: string;
  text: string;
  createdAt: number;
}

export function NarrationPanel({ narrative }: NarrationPanelProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [history, setHistory] = useState<MemoryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const currentNarrativeRef = useRef("");

  useEffect(() => {
    if (!narrative || narrative === currentNarrativeRef.current) return;
    const previous = currentNarrativeRef.current;
    if (previous) {
      setHistory((entries) => [
        { id: `${Date.now()}-${previous.slice(0, 12)}`, text: previous, createdAt: Date.now() },
        ...entries.filter((entry) => entry.text !== previous),
      ].slice(0, 50));
    }
    currentNarrativeRef.current = narrative;
    setDisplayedText("");
    let index = 0;
    const interval = setInterval(() => {
      index += 1;
      setDisplayedText(narrative.slice(0, index));
      if (index >= narrative.length) clearInterval(interval);
    }, 14);
    return () => clearInterval(interval);
  }, [narrative]);

  const filteredHistory = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? history.filter((entry) => entry.text.toLowerCase().includes(normalized))
      : history;
  }, [history, query]);

  const copyNarrative = async () => {
    if (!displayedText || !navigator.clipboard) return;
    await navigator.clipboard.writeText(displayedText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const exportMemory = () => {
    const entries = [
      ...(currentNarrativeRef.current
        ? [{ id: "current", text: currentNarrativeRef.current, createdAt: Date.now() }]
        : []),
      ...history,
    ];
    const blob = new Blob([
      JSON.stringify({ exportedAt: new Date().toISOString(), entries }, null, 2),
    ], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `aether-memory-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside className="narration-shell" aria-label="Scene narrative and temporal memory">
      <section className="narrative-card">
        <div className="panel-heading">
          <div className="panel-title">
            <span className="spark-icon"><Sparkles size={16} /></span>
            <div><p className="section-kicker">Grounded synthesis</p><h2>Scene narrative</h2></div>
          </div>
          <button className="icon-button" onClick={() => void copyNarrative()} disabled={!displayedText} aria-label="Copy current narrative">
            {copied ? <Check size={16} /> : <Clipboard size={16} />}
          </button>
        </div>
        <div className="narrative-content" aria-live="polite">
          {displayedText ? (
            <p>{displayedText}<span className="type-caret" /></p>
          ) : (
            <div className="narrative-empty">
              <span><Sparkles size={20} /></span>
              <strong>Waiting for stream synthesis...</strong>
              <small>Upload a video for on-device analysis or connect a self-hosted backend.</small>
            </div>
          )}
        </div>
        <div className="narrative-footer">
          <span><span className={displayedText ? "pulse-dot" : "idle-dot"} /> {displayedText ? "Context updated" : "Standing by"}</span>
          <span>Grounded in current + recalled frames</span>
        </div>
      </section>

      <section className="memory-card">
        <div className="panel-heading memory-heading">
          <div className="panel-title">
            <span className="memory-icon"><Clock3 size={16} /></span>
            <div><p className="section-kicker">Temporal recall</p><h2>Session memory</h2></div>
          </div>
          <div className="memory-actions">
            <button className="icon-button" onClick={exportMemory} disabled={!history.length && !displayedText} aria-label="Export memory as JSON"><Download size={16} /></button>
            <button className="icon-button" onClick={() => setHistory([])} disabled={!history.length} aria-label="Clear memory"><Trash2 size={16} /></button>
          </div>
        </div>
        <label className="memory-search">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search recalled moments" aria-label="Search temporal memory" />
        </label>
        <div className="memory-list custom-scrollbar">
          {filteredHistory.length ? filteredHistory.map((entry, index) => (
            <article className="memory-entry" key={entry.id}>
              <span className="timeline-node" />
              <div className="memory-meta">
                <span>Moment {history.length - index}</span>
                <time>{new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
              </div>
              <p>{entry.text}</p>
            </article>
          )) : (
            <div className="memory-empty">
              <span><Clock3 size={20} /></span>
              <strong>{query ? "No matching moments" : "Memory is ready"}</strong>
              <p>{query ? "Try a different search term." : "Previous narratives will appear here as the scene changes."}</p>
            </div>
          )}
        </div>
      </section>
    </aside>
  );
}
