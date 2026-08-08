"use client";

import { useCallback, useState } from "react";
import {
  ArrowUpRight, BrainCircuit, Code2, History, Layers3,
  LockKeyhole, ScanSearch,
} from "lucide-react";
import { StreamController } from "@/components/StreamController";
import { NarrationPanel } from "@/components/NarrationPanel";
import { AnalysisPacket, DEMO_SCENES } from "@/lib/vision";

const repositoryUrl = "https://github.com/muhammadmahadazher/sota-vision-rag-pipeline";

export default function Home() {
  const [narrative, setNarrative] = useState(DEMO_SCENES[0].narrative);
  const [lastUpdated, setLastUpdated] = useState(0);

  const handleNarrativeUpdate = useCallback((nextNarrative: string) => {
    setNarrative(nextNarrative);
  }, []);

  const handlePacketUpdate = useCallback((packet: AnalysisPacket) => {
    setLastUpdated(packet.timestamp);
  }, []);

  return (
    <main>
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />
      <nav className="site-nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Aether Vision home">
          <span className="brand-mark"><ScanSearch size={20} /></span>
          <span><strong>AETHER</strong><small>VISION RAG</small></span>
        </a>
        <div className="nav-meta">
          <span className="open-source-badge"><span /> Open source</span>
          <a className="github-link" href={repositoryUrl} target="_blank" rel="noreferrer">
            <Code2 size={17} /><span>View on GitHub</span><ArrowUpRight size={14} />
          </a>
        </div>
      </nav>

      <header className="hero" id="top">
        <div className="hero-copy">
          <p className="hero-eyebrow"><span>Multimodal intelligence</span><i /> Real-time memory</p>
          <h1>Turn live video into <span>searchable context.</span></h1>
          <p className="hero-description">
            A privacy-first Vision RAG workspace that detects, remembers, and explains
            what changes across a video stream—without locking your data into a hosted black box.
          </p>
        </div>
        <div className="hero-proof" aria-label="Platform highlights">
          <div><strong>365+</strong><span>object classes</span></div>
          <div><strong>5 FPS</strong><span>adaptive stream</span></div>
          <div><strong>Local</strong><span>vector memory</span></div>
        </div>
      </header>

      <section className="workspace" aria-label="Aether Vision dashboard">
        <div className="workspace-grid">
          <StreamController
            onNarrativeUpdate={handleNarrativeUpdate}
            onPacketUpdate={handlePacketUpdate}
          />
          <NarrationPanel narrative={narrative} />
        </div>
        <div className="workspace-status">
          <span><LockKeyhole size={13} /> Privacy-first architecture</span>
          <span>
            Last analysis{" "}
            <time suppressHydrationWarning>
              {lastUpdated
                ? new Date(lastUpdated).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                : "ready"}
            </time>
          </span>
        </div>
      </section>

      <section className="capability-strip" aria-label="Core capabilities">
        <article>
          <span><Layers3 size={19} /></span>
          <div><strong>Open-vocabulary detection</strong><p>YOLO-World recognizes a broader scene vocabulary than fixed COCO-only pipelines.</p></div>
        </article>
        <article>
          <span><History size={19} /></span>
          <div><strong>Persistent visual memory</strong><p>Qdrant retrieves related moments so the narrative reflects what happened before.</p></div>
        </article>
        <article>
          <span><BrainCircuit size={19} /></span>
          <div><strong>Grounded synthesis</strong><p>Gemini turns structured detections and recalled context into concise observations.</p></div>
        </article>
      </section>

      <footer className="site-footer">
        <div className="brand footer-brand">
          <span className="brand-mark"><ScanSearch size={18} /></span>
          <span><strong>AETHER</strong><small>VISION RAG</small></span>
        </div>
        <p>Built for experimentation, local-first deployment, and transparent multimodal AI.</p>
        <a href={repositoryUrl} target="_blank" rel="noreferrer">
          MIT licensed <ArrowUpRight size={13} />
        </a>
      </footer>
    </main>
  );
}
