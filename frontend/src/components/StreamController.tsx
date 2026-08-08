"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, Camera, ChevronRight, CircleStop, Cpu, Database, Eye, EyeOff,
  Gauge, Info, LoaderCircle, RotateCcw, ScanLine, Settings2, ShieldCheck,
  Upload, Volume2, VolumeX, Wifi, WifiOff, X,
} from "lucide-react";
import {
  AnalysisPacket, ConnectionState, DEMO_SCENES, EMPTY_PACKET,
  isAnalysisPacket, VisionMode,
} from "@/lib/vision";
import {
  buildLocalNarrative, LocalVisionWorkerEvent, LOCAL_VISION_MODEL,
  normalizeWorkerDetections,
} from "@/vision/localVision";
import {
  DemoControls, DemoSceneVisual, DetectionOverlay, StatusDot, StreamPrivacyChip,
} from "./VisionStage";

interface StreamControllerProps {
  onNarrativeUpdate?: (narrative: string) => void;
  onPacketUpdate?: (packet: AnalysisPacket) => void;
}

const LOCAL_FRAME_INTERVAL_MS = 1800;
const BACKEND_FRAME_INTERVAL_MS = 250;
const LOCAL_FRAME_MAX_EDGE = 640;

export const StreamController = React.memo(function StreamController({
  onNarrativeUpdate,
  onPacketUpdate,
}: StreamControllerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaUrlRef = useRef<string | null>(null);
  const frameTimesRef = useRef<number[]>([]);
  const sceneIndexRef = useRef(0);
  const analysisSequenceRef = useRef(0);
  const analysisBusyRef = useRef(false);
  const localFailedRef = useRef(false);
  const modeRef = useRef<VisionMode>("browser");
  const streamingRef = useRef(false);

  const [mode, setMode] = useState<VisionMode>("browser");
  const [packet, setPacket] = useState<AnalysisPacket>(() => ({
    ...DEMO_SCENES[0],
    timestamp: Date.now(),
  }));
  const [sceneIndex, setSceneIndex] = useState(0);
  const [demoRunning, setDemoRunning] = useState(true);
  const [connectionState, setConnectionState] = useState<ConnectionState>("demo");
  const [mediaSource, setMediaSource] = useState<"camera" | "file" | null>(null);
  const [mediaDimensions, setMediaDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [threshold, setThreshold] = useState(0.5);
  const [endpoint, setEndpoint] = useState(
    process.env.NEXT_PUBLIC_VISION_WS_URL ?? "ws://127.0.0.1:8000/api/stream",
  );
  const [apiToken, setApiToken] = useState("");
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [modelStatus, setModelStatus] = useState("On-device model ready to load");
  const [errorMessage, setErrorMessage] = useState("");

  const publishPacket = useCallback((nextPacket: AnalysisPacket) => {
    setPacket(nextPacket);
    onPacketUpdate?.(nextPacket);
    if (nextPacket.narrative) onNarrativeUpdate?.(nextPacket.narrative);
  }, [onNarrativeUpdate, onPacketUpdate]);

  const publishDemoScene = useCallback((index: number) => {
    sceneIndexRef.current = index;
    setSceneIndex(index);
    publishPacket({ ...DEMO_SCENES[index], timestamp: Date.now() });
  }, [publishPacket]);

  useEffect(() => {
    if (mode !== "browser" || isStreaming || !demoRunning) return;
    const interval = setInterval(
      () => publishDemoScene((sceneIndexRef.current + 1) % DEMO_SCENES.length),
      5200,
    );
    return () => clearInterval(interval);
  }, [demoRunning, isStreaming, mode, publishDemoScene]);

  useEffect(() => {
    if (!ttsEnabled || !packet.narrative || typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(packet.narrative);
    utterance.rate = 0.96;
    window.speechSynthesis.speak(utterance);
    return () => window.speechSynthesis.cancel();
  }, [packet.narrative, ttsEnabled]);

  const clearFrameLoop = useCallback(() => {
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    frameIntervalRef.current = null;
    analysisBusyRef.current = false;
  }, []);

  const closeSocket = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  const stopMedia = useCallback(() => {
    clearFrameLoop();
    closeSocket();
    const video = videoRef.current;
    if (video) {
      video.pause();
      const mediaStream = video.srcObject as MediaStream | null;
      mediaStream?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
      video.removeAttribute("src");
      video.load();
    }
    if (mediaUrlRef.current) URL.revokeObjectURL(mediaUrlRef.current);
    mediaUrlRef.current = null;
    streamingRef.current = false;
    setIsStreaming(false);
    setMediaSource(null);
    setMediaDimensions(null);
  }, [clearFrameLoop, closeSocket]);

  useEffect(() => () => {
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    socketRef.current?.close();
    workerRef.current?.postMessage({ type: "dispose" });
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (mediaUrlRef.current) URL.revokeObjectURL(mediaUrlRef.current);
  }, []);

  const handleWorkerEvent = useCallback((message: LocalVisionWorkerEvent) => {
    if (message.type === "progress") {
      if (modeRef.current === "browser" && streamingRef.current) setConnectionState("loading");
      setModelProgress(message.progress);
      setModelStatus(
        message.progress === null
          ? "Preparing the on-device model"
          : `Downloading vision model · ${message.progress}%`,
      );
      return;
    }
    if (message.type === "ready") {
      setModelProgress(100);
      setModelStatus("On-device model cached and ready");
      if (modeRef.current === "browser" && streamingRef.current) setConnectionState("connected");
      return;
    }
    if (message.type === "error") {
      analysisBusyRef.current = false;
      localFailedRef.current = true;
      clearFrameLoop();
      setConnectionState("error");
      setErrorMessage("On-device inference could not start. Check your internet connection for the first model download, then retry.");
      workerRef.current?.postMessage({ type: "dispose" });
      workerRef.current = null;
      return;
    }

    analysisBusyRef.current = false;
    if (modeRef.current !== "browser" || !streamingRef.current) return;
    const objects = normalizeWorkerDetections(message.detections, message.width, message.height);
    const now = performance.now();
    frameTimesRef.current = frameTimesRef.current.filter((time) => now - time < 1000);
    frameTimesRef.current.push(now);
    publishPacket({
      ...EMPTY_PACKET,
      objects,
      narrative: buildLocalNarrative(objects),
      status: "On-device analysis",
      qdrant_latency_ms: message.elapsedMs,
      device: message.runtime,
      fps: frameTimesRef.current.length,
      frame: { width: message.width, height: message.height },
      timestamp: Date.now(),
    });
    setConnectionState("connected");
  }, [clearFrameLoop, publishPacket]);

  const ensureLocalWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    if (typeof Worker === "undefined") {
      throw new Error("This browser does not support background vision workers.");
    }
    const worker = new Worker(new URL("local-vision-worker.js", document.baseURI), {
      type: "module",
      name: "aether-local-vision",
    });
    worker.onmessage = (event: MessageEvent<LocalVisionWorkerEvent>) => handleWorkerEvent(event.data);
    worker.onerror = () => {
      analysisBusyRef.current = false;
      localFailedRef.current = true;
      clearFrameLoop();
      setConnectionState("error");
      setErrorMessage("The browser stopped the on-device vision worker. Retry the analysis or use the self-hosted backend.");
      workerRef.current = null;
    };
    workerRef.current = worker;
    localFailedRef.current = false;
    setModelProgress(0);
    setModelStatus("Preparing the on-device model");
    return worker;
  }, [clearFrameLoop, handleWorkerEvent]);

  const captureLocalFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || analysisBusyRef.current || localFailedRef.current ||
        video.paused || video.ended || video.videoWidth === 0) return;

    const scale = Math.min(1, LOCAL_FRAME_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    analysisBusyRef.current = true;
    canvas.toBlob((frame) => {
      if (!frame || modeRef.current !== "browser" || !streamingRef.current) {
        analysisBusyRef.current = false;
        return;
      }
      try {
        const worker = ensureLocalWorker();
        analysisSequenceRef.current += 1;
        worker.postMessage({
          type: "analyze",
          id: analysisSequenceRef.current,
          frame,
          width: canvas.width,
          height: canvas.height,
        });
      } catch (error) {
        analysisBusyRef.current = false;
        localFailedRef.current = true;
        clearFrameLoop();
        setConnectionState("error");
        setErrorMessage(error instanceof Error ? error.message : "On-device inference is unavailable.");
      }
    }, "image/jpeg", 0.82);
  }, [clearFrameLoop, ensureLocalWorker]);

  const startLocalAnalysis = useCallback(() => {
    clearFrameLoop();
    closeSocket();
    localFailedRef.current = false;
    setErrorMessage("");
    setConnectionState("loading");
    setModelStatus(workerRef.current ? "Analyzing locally" : "Preparing the on-device model");
    frameIntervalRef.current = setInterval(captureLocalFrame, LOCAL_FRAME_INTERVAL_MS);
    window.setTimeout(captureLocalFrame, 120);
  }, [captureLocalFrame, clearFrameLoop, closeSocket]);

  const transmitFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const socket = socketRef.current;
    if (!video || !canvas || !socket || socket.readyState !== WebSocket.OPEN ||
        video.paused || video.ended || video.videoWidth === 0) return;
    const scale = Math.min(1, 960 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob && socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(blob);
    }, "image/jpeg", 0.76);
  }, []);

  const connectToBackend = useCallback(() => {
    clearFrameLoop();
    closeSocket();
    setErrorMessage("");
    setConnectionState("connecting");
    let socketUrl: URL;
    try {
      socketUrl = new URL(endpoint);
      if (!["ws:", "wss:"].includes(socketUrl.protocol)) throw new Error("Use a ws:// or wss:// URL.");
      if (apiToken.trim()) socketUrl.searchParams.set("token", apiToken.trim());
    } catch (error) {
      setConnectionState("error");
      setErrorMessage(error instanceof Error ? error.message : "The WebSocket URL is invalid.");
      return;
    }

    const socket = new WebSocket(socketUrl.toString());
    socketRef.current = socket;
    socket.onopen = () => {
      setConnectionState("connected");
      frameIntervalRef.current = setInterval(transmitFrame, BACKEND_FRAME_INTERVAL_MS);
    };
    socket.onmessage = (event) => {
      try {
        const incoming: unknown = JSON.parse(event.data);
        if (!isAnalysisPacket(incoming)) throw new Error("Unexpected response");
        const partial = incoming as Partial<AnalysisPacket>;
        const now = performance.now();
        frameTimesRef.current = frameTimesRef.current.filter((time) => now - time < 1000);
        frameTimesRef.current.push(now);
        const video = videoRef.current;
        publishPacket({
          ...EMPTY_PACKET,
          ...partial,
          objects: partial.objects ?? [],
          faces: partial.faces ?? [],
          narrative: partial.narrative ?? "",
          fps: frameTimesRef.current.length,
          frame: { width: video?.videoWidth || 1000, height: video?.videoHeight || 650 },
          timestamp: Date.now(),
        });
      } catch {
        setErrorMessage("The backend returned an unreadable analysis packet.");
      }
    };
    socket.onerror = () => {
      setConnectionState("error");
      setErrorMessage("Could not reach the self-hosted Vision API. Start the local stack and check the endpoint.");
    };
    socket.onclose = () => {
      clearFrameLoop();
      setConnectionState((current) => current === "error" ? current : "offline");
    };
  }, [apiToken, clearFrameLoop, closeSocket, endpoint, publishPacket, transmitFrame]);

  const startAnalysisForCurrentMode = useCallback(() => {
    if (modeRef.current === "browser") startLocalAnalysis();
    else connectToBackend();
  }, [connectToBackend, startLocalAnalysis]);

  const beginCamera = async () => {
    setErrorMessage("");
    try {
      stopMedia();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.loop = false;
      await video.play();
      setMediaDimensions({ width: video.videoWidth, height: video.videoHeight });
      setMediaSource("camera");
      streamingRef.current = true;
      setIsStreaming(true);
      startAnalysisForCurrentMode();
    } catch (error) {
      setErrorMessage(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Camera access was declined. You can upload a video instead."
          : "The camera could not be started on this device.",
      );
    }
  };

  const beginFile = async (file: File) => {
    if (!file.type.startsWith("video/")) {
      setErrorMessage("Choose a supported video file such as MP4, WebM, or MOV.");
      return;
    }
    stopMedia();
    setErrorMessage("");
    const url = URL.createObjectURL(file);
    mediaUrlRef.current = url;
    const video = videoRef.current;
    if (!video) return;
    video.src = url;
    video.loop = true;
    try {
      await video.play();
      setMediaDimensions({ width: video.videoWidth, height: video.videoHeight });
      setMediaSource("file");
      streamingRef.current = true;
      setIsStreaming(true);
      startAnalysisForCurrentMode();
    } catch {
      URL.revokeObjectURL(url);
      mediaUrlRef.current = null;
      setErrorMessage("The browser could not play this video format.");
    }
  };

  const switchMode = (nextMode: VisionMode) => {
    if (nextMode === mode) return;
    stopMedia();
    modeRef.current = nextMode;
    setMode(nextMode);
    setErrorMessage("");
    setModelProgress(null);
    if (nextMode === "browser") {
      setConnectionState("demo");
      publishDemoScene(sceneIndexRef.current);
    } else {
      setConnectionState("offline");
      publishPacket({ ...EMPTY_PACKET, timestamp: Date.now() });
    }
  };

  const retryLocalAnalysis = () => {
    workerRef.current?.postMessage({ type: "dispose" });
    workerRef.current = null;
    localFailedRef.current = false;
    startLocalAnalysis();
  };

  const visibleObjects = useMemo(
    () => packet.objects.filter((object) => object.confidence >= threshold),
    [packet.objects, threshold],
  );
  const visibleFaces = useMemo(
    () => packet.faces.filter((face) => face.confidence >= threshold),
    [packet.faces, threshold],
  );
  const inventory = useMemo(() => {
    const counts = new Map<string, number>();
    visibleObjects.forEach((object) => counts.set(object.label, (counts.get(object.label) ?? 0) + 1));
    return Array.from(counts.entries());
  }, [visibleObjects]);

  const currentScene = DEMO_SCENES[sceneIndex];
  const isSample = mode === "browser" && !isStreaming;
  const stateLabel = isSample ? "Interactive sample"
    : connectionState === "connected" && mode === "browser" ? "On-device analysis"
    : connectionState === "connected" ? "Backend connected"
    : connectionState === "loading" ? "Loading local model"
    : connectionState === "connecting" ? "Connecting"
    : connectionState === "error" ? "Analysis issue" : "Backend offline";

  return (
    <section className="vision-shell" aria-label="Vision analysis workspace">
      <div className="vision-toolbar">
        <div><p className="section-kicker">Vision canvas</p><h2>Live scene intelligence</h2></div>
        <div className="toolbar-actions">
          <div className="mode-switch" aria-label="Analysis mode">
            <button className={mode === "browser" ? "is-active" : ""} onClick={() => switchMode("browser")}>On-device</button>
            <button className={mode === "backend" ? "is-active" : ""} onClick={() => switchMode("backend")}>Self-hosted</button>
          </div>
          <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open vision settings"><Settings2 size={18} /></button>
        </div>
      </div>

      <div
        className={`vision-stage ${isDragging ? "is-dragging" : ""}`}
        style={isStreaming && mediaDimensions ? { aspectRatio: `${mediaDimensions.width} / ${mediaDimensions.height}` } : undefined}
        onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void beginFile(file);
        }}
      >
        <video ref={videoRef} className="vision-video" playsInline muted hidden={!isStreaming} />
        {isSample ? <DemoSceneVisual visual={currentScene.visual} /> : !isStreaming ? (
          <div className="live-empty-state">
            <span className="empty-state-icon"><ScanLine size={28} /></span>
            <p className="section-kicker">Optional self-hosted processing</p>
            <h3>Choose a source to begin</h3>
            <p>Frames go only to the WebSocket endpoint you configure. Start the local stack first, or use On-device mode for the hosted demo.</p>
            <div className="empty-state-actions">
              <button className="primary-button" onClick={() => void beginCamera()}><Camera size={17} /> Use camera</button>
              <button className="secondary-button" onClick={() => fileInputRef.current?.click()}><Upload size={17} /> Upload video</button>
            </div>
          </div>
        ) : null}

        {(isSample || isStreaming) && (
          <DetectionOverlay objects={packet.objects} faces={packet.faces} frame={packet.frame} threshold={threshold} showLabels={showLabels} />
        )}
        <div className="stage-topbar">
          <span className="live-chip"><StatusDot state={connectionState} /> {stateLabel}</span>
          <StreamPrivacyChip mode={isSample ? "sample" : mode === "browser" ? "local" : "backend"} />
        </div>
        {isSample && (
          <DemoControls
            scene={currentScene}
            running={demoRunning}
            onToggle={() => setDemoRunning((running) => !running)}
            onNext={() => publishDemoScene((sceneIndexRef.current + 1) % DEMO_SCENES.length)}
            onCamera={() => void beginCamera()}
            onUpload={() => fileInputRef.current?.click()}
          />
        )}
        {mode === "browser" && isStreaming && connectionState === "loading" && (
          <div className="model-loading-card" role="status" aria-live="polite">
            <LoaderCircle size={18} className="loading-spinner" />
            <div><strong>{modelStatus}</strong><span>First run downloads and caches the compact model.</span></div>
            {modelProgress !== null && <progress max="100" value={modelProgress} aria-label="Model download progress" />}
          </div>
        )}
        {isStreaming && (
          <div className="demo-caption">
            <div><span>Input source</span><strong>{mediaSource === "camera" ? "Device camera" : "Local video file"}</strong></div>
            <div className="stage-controls">
              <button
                onClick={mode === "browser" ? (connectionState === "error" ? retryLocalAnalysis : captureLocalFrame) : connectToBackend}
                aria-label={mode === "browser" ? "Analyze frame now" : "Reconnect backend"}
                title={mode === "browser" ? "Analyze frame now" : "Reconnect backend"}
              ><RotateCcw size={17} /></button>
              <button onClick={() => {
                stopMedia();
                setConnectionState(mode === "browser" ? "demo" : "offline");
                if (mode === "browser") publishDemoScene(sceneIndexRef.current);
              }} aria-label="Stop stream"><CircleStop size={17} /></button>
            </div>
          </div>
        )}
        {errorMessage && (
          <div className="stage-error" role="alert">
            <Info size={16} /><span>{errorMessage}</span>
            <button onClick={() => setErrorMessage("")} aria-label="Dismiss error"><X size={14} /></button>
          </div>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void beginFile(file);
          event.target.value = "";
        }}
      />
      <canvas ref={canvasRef} hidden />

      <div className="telemetry-grid">
        <Metric icon={<Activity size={16} />} label="Throughput" value={`${packet.fps || 0}`} unit="FPS" note={mode === "browser" ? "private" : "live"} />
        <Metric icon={<Gauge size={16} />} label="Pipeline latency" value={`${Math.round(packet.qdrant_latency_ms)}`} unit="ms" note="latest" />
        <Metric icon={<ScanLine size={16} />} label="Detections" value={`${visibleObjects.length + visibleFaces.length}`} unit="active" note={`≥ ${Math.round(threshold * 100)}%`} />
        <Metric icon={<Cpu size={16} />} label="Runtime" value={packet.device} note="auto" runtime />
      </div>

      <div className="inventory-row">
        <div className="inventory-heading">
          <div><p className="section-kicker">Current frame</p><h3>Object inventory</h3></div>
          <span>{visibleObjects.length} tracked</span>
        </div>
        <div className="inventory-list">
          {inventory.length ? inventory.map(([label, count]) => (
            <span className="inventory-pill" key={label}>{label}<strong>{count}</strong></span>
          )) : <p className="inventory-empty">No detections above the current confidence threshold.</p>}
        </div>
        <div className="pipeline-state">
          <span className={connectionState === "connected" || connectionState === "demo" ? "is-online" : ""}>
            {connectionState === "connected" || connectionState === "demo" ? <Wifi size={15} /> : <WifiOff size={15} />} Inference
          </span>
          <ChevronRight size={14} />
          <span className={packet.timestamp > 0 ? "is-online" : ""}><Database size={15} /> Session memory</span>
        </div>
      </div>

      {settingsOpen && (
        <div className="settings-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <aside className="settings-panel" onMouseDown={(event) => event.stopPropagation()} aria-label="Vision settings">
            <div className="settings-header">
              <div><p className="section-kicker">Workspace controls</p><h3>Vision settings</h3></div>
              <button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X size={18} /></button>
            </div>
            <div className="setting-group">
              <div className="setting-copy"><span>Confidence threshold</span><strong>{Math.round(threshold * 100)}%</strong></div>
              <input aria-label="Confidence threshold" type="range" min="0.2" max="0.95" step="0.05" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
            </div>
            <SettingToggle active={showLabels} onClick={() => setShowLabels((shown) => !shown)}
              icon={showLabels ? <Eye size={17} /> : <EyeOff size={17} />} title="Detection labels" detail="Show class and confidence" />
            <SettingToggle active={ttsEnabled} onClick={() => setTtsEnabled((enabled) => !enabled)}
              icon={ttsEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />} title="Spoken narratives" detail="Use browser text-to-speech" />
            <div className="setting-divider" />
            {mode === "backend" ? (
              <div className="connection-fields">
                <div><p className="section-kicker">Self-hosted backend</p><h4>Connection</h4></div>
                <label>WebSocket endpoint<input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="ws://127.0.0.1:8000/api/stream" /></label>
                <label>API token <small>(optional)</small><input type="password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} placeholder="Kept only in this tab" autoComplete="off" /></label>
                <p className="field-help"><ShieldCheck size={14} /> Credentials stay in browser memory and are never bundled into the static site.</p>
                {isStreaming && <button className="secondary-button full-width" onClick={() => { connectToBackend(); setSettingsOpen(false); }}>Apply and reconnect</button>}
              </div>
            ) : (
              <div className="connection-fields">
                <div><p className="section-kicker">On-device engine</p><h4>Private browser inference</h4></div>
                <p className="local-engine-copy">The pinned YOLOS-tiny model runs in a background worker with Transformers.js. Model files are cached after the first download.</p>
                <p className="field-help"><ShieldCheck size={14} /> Video frames never leave this browser in On-device mode.</p>
                <small className="model-revision">Model revision · {LOCAL_VISION_MODEL.revision.slice(0, 12)}</small>
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
});

function Metric({ icon, label, value, unit, note, runtime = false }: {
  icon: React.ReactNode; label: string; value: string; unit?: string; note: string; runtime?: boolean;
}) {
  return (
    <article className="metric-card">
      <span className="metric-icon">{icon}</span>
      <div><span>{label}</span><strong className={runtime ? "metric-runtime" : ""}>{value} {unit && <small>{unit}</small>}</strong></div>
      <span className="metric-trend">{note}</span>
    </article>
  );
}

function SettingToggle({ active, onClick, icon, title, detail }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; title: string; detail: string;
}) {
  return (
    <button className="setting-toggle" onClick={onClick}>
      <span>{icon}<span><strong>{title}</strong><small>{detail}</small></span></span>
      <i className={active ? "is-on" : ""} />
    </button>
  );
}
