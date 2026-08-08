import {
  ArrowUpRight, CheckCircle2, Cpu, MonitorUp, PlayCircle, Terminal,
} from "lucide-react";
import styles from "./LocalQuickstart.module.css";

const repositoryUrl = "https://github.com/muhammadmahadazher/sota-vision-rag-pipeline";

function CommandBlock({ children, label }: { children: string; label: string }) {
  return (
    <div className={styles.commandBlock}>
      <span>{label}</span>
      <pre><code>{children}</code></pre>
    </div>
  );
}

export function LocalQuickstart() {
  return (
    <section className={styles.section} id="run-locally" aria-labelledby="run-locally-title">
      <div className={styles.heading}>
        <div>
          <p>Start here</p>
          <h2 id="run-locally-title">Use the live demo—or run the complete stack.</h2>
        </div>
        <a href={`${repositoryUrl}/blob/main/LOCAL_SETUP.md`} target="_blank" rel="noreferrer">
          Full setup guide <ArrowUpRight size={14} />
        </a>
      </div>

      <div className={styles.demoGuide} aria-label="How to use the hosted demo">
        <div className={styles.demoIntro}>
          <span><PlayCircle size={20} /></span>
          <div><strong>Hosted demo</strong><p>No install, backend, account, or API key required.</p></div>
        </div>
        <ol>
          <li><span>01</span><div><strong>Keep On-device selected</strong><p>The GitHub Pages build is locked to the working browser path.</p></div></li>
          <li><span>02</span><div><strong>Upload a video or enable camera</strong><p>MP4, WebM, and MOV files are supported by the browser.</p></div></li>
          <li><span>03</span><div><strong>Watch the Runtime card</strong><p>Analysis starts on built-in CPU vision, then upgrades to NVIDIA/AMD WebGPU or WASM when available.</p></div></li>
        </ol>
      </div>

      <div className={styles.platformGrid}>
        <article>
          <div className={styles.cardTitle}><span><MonitorUp size={18} /></span><div><strong>Windows</strong><p>Node.js 20.9+ · Python 3.12+ · Git</p></div></div>
          <CommandBlock label="PowerShell or Command Prompt">{"git clone https://github.com/muhammadmahadazher/sota-vision-rag-pipeline.git\ncd sota-vision-rag-pipeline\n.\\setup.bat\n.\\run.bat"}</CommandBlock>
          <p className={styles.openAt}><CheckCircle2 size={14} /> Opens automatically when ready: <code>http://127.0.0.1:3000</code></p>
        </article>
        <article>
          <div className={styles.cardTitle}><span><Terminal size={18} /></span><div><strong>Linux / macOS</strong><p>Node.js 20.9+ · Python 3.12+ · Git</p></div></div>
          <CommandBlock label="Terminal">{"git clone https://github.com/muhammadmahadazher/sota-vision-rag-pipeline.git\ncd sota-vision-rag-pipeline\nchmod +x setup.sh run.sh\n./setup.sh && ./run.sh"}</CommandBlock>
          <p className={styles.openAt}><CheckCircle2 size={14} /> Open <code>http://127.0.0.1:3000</code></p>
        </article>
      </div>

      <div className={styles.hardwareNote}>
        <span><Cpu size={19} /></span>
        <div><strong>Hardware selection is automatic.</strong><p>The browser and Python backend prefer supported NVIDIA or AMD acceleration and fall back to CPU with a visible reason. Run <code>python -m app.core.hardware</code> inside <code>backend</code> to inspect the backend decision.</p></div>
      </div>
    </section>
  );
}
