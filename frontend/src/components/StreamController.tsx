"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, Camera, ChevronRight, CircleStop, Cpu, Database, Eye, EyeOff,
  Gauge, Info, RotateCcw, ScanLine, Settings2, ShieldCheck, Upload,
  Volume2, VolumeX, Wifi, WifiOff, X,
} from "lucide-react";
import {
  AnalysisPacket, ConnectionState, DEMO_SCENES, EMPTY_PACKET,
  isAnalysisPacket, VisionMode,
} from "@/lib/vision";
import {
  DemoControls, DemoSceneVisual, DetectionOverlay, StatusDot, StreamPrivacyChip,
} from "./VisionStage";

interface StreamControllerProps {
  onNarrativeUpdate?: (narrative: string) => void;
  onPacketUpdate?: (packet: AnalysisPacket) => void;
}

export const StreamController = React.memo(function StreamController({
  onNarrativeUpdate,
  onPacketUpdate,
}: StreamControllerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaUrlRef = useRef<string | null>(null);
  const frameTimesRef = useRef<number[]>([]);
  const sceneIndexRef = useRef(0);

  const [mode, setMode] = useState<VisionMode>("demo");
  const [packet, setPacket] = useState<AnalysisPacket>(() => ({
    ...DEMO_SCENES[0],
    timestamp: Date.now(),
  }));
  const [sceneIndex, setSceneIndex] = useState(0);
  const [demoRunning, setDemoRunning] = useState(true);
  const [connectionState, setConnectionState] = useState<ConnectionState>("demo");
  const [mediaSource, setMediaSource] = useState<"camera" | "file" | null>(null);
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
    if (mode !== "demo" || !demoRunning) return;
    const interval = setInterval(
      () => publishDemoScene((sceneIndexRef.current + 1) % DEMO_SCENES.length),
      5200,
    );
    return () => clearInterval(interval);
  }, [demoRunning, mode, publishDemoScene]);

  useEffect(() => {
    if (!ttsEnabled || !packet.narrative || typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(packet.narrative);
    utterance.rate = 0.96;
    window.speechSynthesis.speak(utterance);
    return () => window.speechSynthesis.cancel();
  }, [packet.narrative, ttsEnabled]);

  const closeSocket = useCallback(() => {
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    frameIntervalRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  const stopMedia = useCallback(() => {
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
    setIsStreaming(false);
    setMediaSource(null);
  }, [closeSocket]);

  useEffect(() => () => {
    closeSocket();
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (mediaUrlRef.current) URL.revokeObjectURL(mediaUrlRef.current);
  }, [closeSocket]);

  const transmitFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const socket = socketRef.current;
    if (!video || !canvas || !socket || socket.readyState !== WebSocket.OPEN) return;
    if (video.paused || video.ended || video.videoWidth === 0) return;
    const scale = Math.min(1, 960 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(blob);
      }
    }, "image/jpeg", 0.76);
  }, []);

  const connectToBackend = useCallback(() => {
    closeSocket();
    setErrorMessage("");
    setConnectionState("connecting");
    let socketUrl: URL;
    try {
      socketUrl = new URL(endpoint);
      if (!["ws:", "wss:"].includes(socketUrl.protocol)) {
        throw new Error("Use a ws:// or wss:// URL.");
      }
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
      frameIntervalRef.current = setInterval(transmitFrame, 250);
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
          frame: {
            width: video?.videoWidth || 1000,
            height: video?.videoHeight || 650,
          },
          timestamp: Date.now(),
        });
      } catch {
        setErrorMessage("The backend returned an unreadable analysis packet.");
      }
    };
    socket.onerror = () => {
      setConnectionState("error");
      setErrorMessage("Could not reach the Vision API. Start the local stack and check the endpoint.");
    };
    socket.onclose = () => {
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
      setConnectionState((current) => current === "error" ? current : "offline");
    };
  }, [apiToken, closeSocket, endpoint, publishPacket, transmitFrame]);

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
      setMediaSource("camera");
      setIsStreaming(true);
      connectToBackend();
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
      setMediaSource("file");
      setIsStreaming(true);
      connectToBackend();
    } catch {
      setErrorMessage("The browser could not play this video format.");
    }
  };

  const switchMode = (nextMode: VisionMode) => {
    if (nextMode === mode) return;
    stopMedia();
    setMode(nextMode);
    setErrorMessage("");
    setConnectionState(nextMode === "demo" ? "demo" : "offline");
    if (nextMode === "demo") publishDemoScene(sceneIndexRef.current);
    else publishPacket({ ...EMPTY_PACKET, timestamp: Date.now() });
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
    visibleObjects.forEach((object) =>
      counts.set(object.label, (counts.get(object.label) ?? 0) + 1),
    );
    return Array.from(counts.entries());
  }, [visibleObjects]);

  const currentScene = DEMO_SCENES[sceneIndex];
  const stateLabel = connectionState === "demo" ? "Interactive sample"
    : connectionState === "connected" ? "Backend connected"
    : connectionState === "connecting" ? "Connecting"
    : connectionState === "error" ? "Connection issue" : "Backend offline";

  return (
    <section className="vision-shell" aria-label="Vision analysis workspace">
      <div className="vision-toolbar">
        <div><p className="section-kicker">Vision canvas</p><h2>Live scene intelligence</h2></div>
        <div className="toolbar-actions">
          <div className="mode-switch" aria-label="Analysis mode">
            <button className={mode === "demo" ? "is-active" : ""} onClick={() => switchMode("demo")}>Demo</button>
            <button className={mode === "live" ? "is-active" : ""} onClick={() => switchMode("live")}>Live backend</button>
          </div>
          <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open vision settings"><Settings2 size={18} /></button>
        </div>
      </div>

      <div
        className={`vision-stage ${isDragging ? "is-dragging" : ""}`}
        onDragOver={(event) => { if (mode === "live") { event.preventDefault(); setIsDragging(true); } }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          const file = event.dataTransfer.files[0];
          if (mode === "live" && file) void beginFile(file);
        }}
      >
        <video ref={videoRef} className="vision-video" playsInline muted hidden={mode !== "live" || !isStreaming} />
        {mode === "demo" ? <DemoSceneVisual visual={currentScene.visual} /> : !isStreaming && (
          <div className="live-empty-state">
            <span className="empty-state-icon"><ScanLine size={28} /></span>
            <p className="section-kicker">Private local processing</p>
            <h3>Choose a source to begin</h3>
            <p>Frames travel directly to the WebSocket endpoint you configure. Nothing is uploaded by this demo page.</p>
            <div className="empty-state-actions">
              <button className="primary-button" onClick={() => void beginCamera()}><Camera size={17} /> Use camera</button>
              <button className="secondary-button" onClick={() => fileInputRef.current?.click()}><Upload size={17} /> Upload video</button>
            </div>
          </div>
        )}

        {(mode === "demo" || isStreaming) && (
          <DetectionOverlay objects={packet.objects} faces={packet.faces} frame={packet.frame} threshold={threshold} showLabels={showLabels} />
        )}
        <div className="stage-topbar">
          <span className="live-chip"><StatusDot state={connectionState} /> {stateLabel}</span>
          <StreamPrivacyChip isDemo={mode === "demo"} />
        </div>
        {mode === "demo" && (
          <DemoControls
            scene={currentScene}
            running={demoRunning}
            onToggle={() => setDemoRunning((running) => !running)}
            onNext={() => publishDemoScene((sceneIndexRef.current + 1) % DEMO_SCENES.length)}
          />
        )}
        {mode === "live" && isStreaming && (
          <div className="demo-caption">
            <div><span>Input source</span><strong>{mediaSource === "camera" ? "Device camera" : "Local video file"}</strong></div>
            <div className="stage-controls">
              <button onClick={connectToBackend} aria-label="Reconnect backend"><RotateCcw size={17} /></button>
              <button onClick={() => { stopMedia(); setConnectionState("offline"); }} aria-label="Stop stream"><CircleStop size={17} /></button>
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
        <Metric icon={<Activity size={16} />} label="Throughput" value={`${packet.fps || 0}`} unit="FPS" note="live" />
        <Metric icon={<Gauge size={16} />} label="Vector latency" value={`${Math.round(packet.qdrant_latency_ms)}`} unit="ms" note="p50" />
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
          <span className={packet.qdrant_latency_ms > 0 ? "is-online" : ""}><Database size={15} /> Memory</span>
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
            <div className="connection-fields">
              <div><p className="section-kicker">Local backend</p><h4>Connection</h4></div>
              <label>WebSocket endpoint<input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="ws://127.0.0.1:8000/api/stream" /></label>
              <label>API token <small>(optional)</small><input type="password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} placeholder="Kept only in this tab" autoComplete="off" /></label>
              <p className="field-help"><ShieldCheck size={14} /> Credentials stay in browser memory and are never bundled into the static site.</p>
              {mode === "live" && isStreaming && <button className="secondary-button full-width" onClick={() => { connectToBackend(); setSettingsOpen(false); }}>Apply and reconnect</button>}
            </div>
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
