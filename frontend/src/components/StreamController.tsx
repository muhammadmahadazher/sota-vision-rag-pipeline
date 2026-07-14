"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface DetectedObject {
  bbox: number[];
  label: string;
  confidence: number;
}

interface DetectedFace {
  bbox: number[];
  gender: number;
  age: number;
  confidence: number;
}

interface StreamControllerProps {
  onNarrativeUpdate?: (narrative: string) => void;
}

export const StreamController = React.memo(function StreamController({ onNarrativeUpdate }: StreamControllerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Core stream states
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamSource, setStreamSource] = useState<"webcam" | "video" | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);

  // Config settings states
  const [showLabels, setShowLabels] = useState(true);
  const [boxStyle, setBoxStyle] = useState<"corners" | "outline" | "full">("corners");
  const [confThreshold, setConfThreshold] = useState(0.25);
  const [useTTS, setUseTTS] = useState(false);

  // Telemetry HUD states
  const [fps, setFps] = useState(0);
  const [dbLatency, setDbLatency] = useState(0);
  const [device, setDevice] = useState("CPU");
  const [apiStatus, setApiStatus] = useState<"offline" | "connected">("offline");
  const [dbStatus, setDbStatus] = useState<"offline" | "connected">("offline");
  const [activeDetections, setActiveDetections] = useState<{ objects: DetectedObject[], faces: DetectedFace[] }>({ objects: [], faces: [] });

  // Refs for config settings to prevent closure stale values
  const showLabelsRef = useRef(showLabels);
  const boxStyleRef = useRef(boxStyle);
  const confThresholdRef = useRef(confThreshold);
  const useTTSRef = useRef(useTTS);
  const lastSpokenNarrative = useRef("");
  const frameTimes = useRef<number[]>([]);
  const latestDetections = useRef<{ objects: DetectedObject[], faces: DetectedFace[] }>({ objects: [], faces: [] });

  // Keep configuration refs in sync
  useEffect(() => { showLabelsRef.current = showLabels; }, [showLabels]);
  useEffect(() => { boxStyleRef.current = boxStyle; }, [boxStyle]);
  useEffect(() => { confThresholdRef.current = confThreshold; }, [confThreshold]);
  useEffect(() => { useTTSRef.current = useTTS; }, [useTTS]);

  // Draw overlay method
  const drawOverlay = useCallback(() => {
    if (!overlayCanvasRef.current || !videoRef.current) return;

    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext("2d");
    const video = videoRef.current;

    if (!ctx) return;

    if (video.videoWidth > 0 && video.videoHeight > 0) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
    } else {
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const { objects, faces } = latestDetections.current;
    const currentConf = confThresholdRef.current;
    const currentStyle = boxStyleRef.current;
    const currentShowLabels = showLabelsRef.current;

    // Helper for drawing Apple-style glowing brackets
    const drawCorners = (x: number, y: number, w: number, h: number, color: string) => {
      const len = Math.min(18, w / 4, h / 4);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";

      // Top-Left
      ctx.beginPath();
      ctx.moveTo(x + len, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + len);
      ctx.stroke();

      // Top-Right
      ctx.beginPath();
      ctx.moveTo(x + w - len, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + len);
      ctx.stroke();

      // Bottom-Left
      ctx.beginPath();
      ctx.moveTo(x, y + h - len);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x + len, y + h);
      ctx.stroke();

      // Bottom-Right
      ctx.beginPath();
      ctx.moveTo(x + w - len, y + h);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w, y + h - len);
      ctx.stroke();
    };

    // Draw objects
    objects.forEach((obj) => {
      if (obj.confidence < currentConf) return;

      const [x1, y1, x2, y2] = obj.bbox;
      const width = x2 - x1;
      const height = y2 - y1;
      const color = "rgba(10, 132, 255, 0.95)"; // Apple System Blue

      ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
      ctx.shadowBlur = 4;

      if (currentStyle === "corners") {
        drawCorners(x1, y1, width, height, color);
      } else if (currentStyle === "outline") {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x1, y1, width, height);
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x1, y1, width, height);
      }

      if (currentShowLabels) {
        ctx.fillStyle = color;
        const labelText = `${obj.label.toUpperCase()} ${(obj.confidence * 100).toFixed(0)}%`;
        ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, sans-serif";
        const textWidth = ctx.measureText(labelText).width;

        ctx.fillRect(x1, y1 - 20, textWidth + 8, 20);
        ctx.fillStyle = "#FFFFFF";
        ctx.shadowBlur = 0;
        ctx.fillText(labelText, x1 + 4, y1 - 6);
      }
    });

    // Draw faces
    faces.forEach((face) => {
      if (face.confidence < currentConf) return;

      const [x1, y1, x2, y2] = face.bbox;
      const width = x2 - x1;
      const height = y2 - y1;
      const color = "rgba(255, 159, 10, 0.95)"; // Apple System Orange

      ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
      ctx.shadowBlur = 4;

      if (currentStyle === "corners") {
        drawCorners(x1, y1, width, height, color);
      } else if (currentStyle === "outline") {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x1, y1, width, height);
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x1, y1, width, height);
      }

      if (currentShowLabels) {
        ctx.fillStyle = color;
        const genderStr = face.gender === 1 ? "MALE" : "FEMALE";
        const labelText = `FACE: ${genderStr}${face.age ? " | AGE: " + face.age : ""}`;
        ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, sans-serif";
        const textWidth = ctx.measureText(labelText).width;

        ctx.fillRect(x1, y1 - 20, textWidth + 8, 20);
        ctx.fillStyle = "#FFFFFF";
        ctx.shadowBlur = 0;
        ctx.fillText(labelText, x1 + 4, y1 - 6);
      }
    });
  }, []);

  // Frame render loop hook
  useEffect(() => {
    let animationFrameId: number;

    const renderLoop = () => {
      if (isStreaming) {
        drawOverlay();
      } else {
        if (overlayCanvasRef.current) {
          const ctx = overlayCanvasRef.current.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
        }
      }
      animationFrameId = requestAnimationFrame(renderLoop);
    };

    renderLoop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [isStreaming, drawOverlay]);

  // Initialize WebSocket connection
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const apiToken = process.env.NEXT_PUBLIC_API_TOKEN || "secret-token";
    const wsUrl = `ws://127.0.0.1:8000/api/stream?token=${apiToken}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("WebSocket connected to backend");
      setApiStatus("connected");
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setApiStatus("offline");
      setDbStatus("offline");
      setFps(0);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setApiStatus("offline");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === "Stream Disconnected") {
          setIsDisconnected(true);
        }

        // Calculate rolling FPS
        const now = performance.now();
        frameTimes.current = frameTimes.current.filter(t => now - t < 1000);
        frameTimes.current.push(now);
        setFps(frameTimes.current.length);

        // Update database and hardware device info from response payload
        setDbStatus("connected");
        setDbLatency(Math.round(data.qdrant_latency_ms || 0));
        setDevice(data.device ? data.device.toUpperCase() : "CPU");

        if (data.narrative) {
          if (onNarrativeUpdate) onNarrativeUpdate(data.narrative);

          // Audio text-to-speech implementation
          if (useTTSRef.current && data.narrative !== lastSpokenNarrative.current) {
            lastSpokenNarrative.current = data.narrative;
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(data.narrative);
            utterance.rate = 1.0;
            window.speechSynthesis.speak(utterance);
          }
        }

        // Update state and refs
        const objects = data.objects || [];
        const faces = data.faces || [];
        latestDetections.current = { objects, faces };
        setActiveDetections({ objects, faces });

      } catch (e) {
        console.error("Error parsing websocket message:", e);
      }
    };

    wsRef.current = ws;
  }, [onNarrativeUpdate]);

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const startFrameExtraction = () => {
    if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);

    streamIntervalRef.current = setInterval(() => {
      if (!videoRef.current || !hiddenCanvasRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return;
      }

      const video = videoRef.current;
      const canvas = hiddenCanvasRef.current;
      const context = canvas.getContext("2d");

      if (!context || video.paused || video.ended) return;

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (blob && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(blob);
        }
      }, "image/jpeg", 0.75);
    }, 200); // 5 FPS frame skipping
  };

  const stopFrameExtraction = () => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
  };

  useEffect(() => {
    if (isStreaming) {
      connectWebSocket();
      startFrameExtraction();
    } else {
      stopFrameExtraction();
      disconnectWebSocket();
    }

    return () => {
      stopFrameExtraction();
      disconnectWebSocket();
    };
  }, [isStreaming, connectWebSocket]);

  const startWebcam = async () => {
    try {
      setIsIngesting(true);
      setIsDisconnected(false);
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setStreamSource("webcam");
        setIsStreaming(true);
      }
      setIsIngesting(false);
    } catch (err) {
      console.error("Error accessing webcam:", err);
      setIsIngesting(false);
    }
  };

  const processFile = (file: File) => {
    if (file && videoRef.current) {
      setIsIngesting(true);
      setIsDisconnected(false);
      const url = URL.createObjectURL(file);
      videoRef.current.srcObject = null;
      videoRef.current.src = url;
      videoRef.current.play().catch(err => {
        console.error("Video play failed:", err);
        setIsIngesting(false);
      });
      setStreamSource("video");
      setIsStreaming(true);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type === "video/mp4" || file.type === "video/webm" || file.name.endsWith('.mp4') || file.name.endsWith('.webm'))) {
      processFile(file);
    }
  };

  const stopStream = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      if (streamSource === "webcam") {
        const stream = videoRef.current.srcObject as MediaStream;
        stream?.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
      videoRef.current.src = "";
    }
    setIsStreaming(false);
    setStreamSource(null);
    setIsDisconnected(false);
    latestDetections.current = { objects: [], faces: [] };
    setActiveDetections({ objects: [], faces: [] });
    setFps(0);
    setDbLatency(0);
  };

  const layoutTransition = {
    layout: {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1]
    } as const
  };

  // Group active objects by count for density stats
  const objectDensityCounts = activeDetections.objects.reduce((acc: { [key: string]: number }, cur) => {
    if (cur.confidence >= confThreshold) {
      acc[cur.label] = (acc[cur.label] || 0) + 1;
    }
    return acc;
  }, {});

  const densityEntries = Object.entries(objectDensityCounts).sort((a, b) => b[1] - a[1]);

  return (
    <motion.div 
      layout 
      transition={layoutTransition.layout} 
      className="flex flex-col gap-6 w-full h-full max-w-4xl mx-auto"
    >
      <div className="backdrop-blur-3xl bg-[#1C1C1E]/60 border border-white/[0.04] shadow-[0_4px_30px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.05)] rounded-3xl p-6 overflow-hidden relative group transition-all duration-300">
        
        {/* Main Video Viewport with Drag & Drop */}
        <div
          className={`relative rounded-2xl overflow-hidden bg-black aspect-video flex items-center justify-center border transition-all duration-500 ${
            isDragging 
              ? 'border-[#0A84FF]/60 ring-4 ring-[#0A84FF]/20 scale-[0.99] shadow-[0_0_20px_rgba(10,132,255,0.3)]' 
              : 'border-white/[0.02] shadow-inner'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Glowing Drop Animation Overlay */}
          <AnimatePresence>
            {isDragging && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-[#0A84FF]/10 backdrop-blur-sm z-40 flex flex-col items-center justify-center text-[#0A84FF]"
              >
                <motion.div
                  animate={{ y: [0, -12, 0] }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                  className="mb-4"
                >
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_0_8px_rgba(10,132,255,0.4)]">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                </motion.div>
                <p className="text-xs font-bold uppercase tracking-widest">Drop video file here</p>
                <p className="text-[10px] text-[#0A84FF]/60 mt-1 uppercase font-semibold tracking-wider">MP4, WEBM</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Premium Loading Indicator */}
          <AnimatePresence>
            {isIngesting && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/80 backdrop-blur-md z-45 flex flex-col items-center justify-center text-[#0A84FF] gap-4"
              >
                <div className="relative w-12 h-12">
                  <span className="absolute inset-0 rounded-full border-4 border-[#0A84FF]/15"></span>
                  <span className="absolute inset-0 rounded-full border-4 border-t-[#0A84FF] animate-spin"></span>
                </div>
                <p className="text-[10px] font-semibold tracking-widest uppercase text-[#8E8E93] animate-pulse">
                  Processing Stream Source...
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Disconnect Overlay */}
          <AnimatePresence>
            {isDisconnected && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-red-950/20 backdrop-blur-md z-45 flex flex-col items-center justify-center text-red-500 gap-4"
              >
                <div className="relative w-12 h-12 flex items-center justify-center bg-red-500/10 border border-red-500/30 rounded-full animate-pulse">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                    <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v3m-1.5 5.5A6 6 0 1 1 12 6c1.3 0 2.5.4 3.5 1.1"></path>
                  </svg>
                </div>
                <p className="text-xs font-bold uppercase tracking-widest text-red-400">
                  Stream Interrupted
                </p>
                <p className="text-[10px] text-red-400/60 uppercase font-semibold tracking-wider">
                  Check media source or connection.
                </p>
                <button
                  onClick={stopStream}
                  className="mt-2 px-4 py-1.5 rounded-full bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 text-[10px] font-bold uppercase tracking-wider transition-all duration-300"
                >
                  Dismiss
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {!isStreaming && !isDragging && !isIngesting && !isDisconnected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/30 z-10 pointer-events-none gap-3">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-30">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
              <p className="text-[10px] font-bold tracking-widest uppercase text-[#8E8E93]">No active feed. Drag and drop media.</p>
            </div>
          )}

          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-contain z-20"
            playsInline
            muted
            loop={streamSource === "video"}
            onPlay={() => setIsIngesting(false)}
            onLoadedData={() => setIsIngesting(false)}
          />

          <canvas
            ref={overlayCanvasRef}
            className="absolute inset-0 w-full h-full object-contain z-30 pointer-events-none"
          />
        </div>

        {/* Hidden Extraction Canvas */}
        <canvas ref={hiddenCanvasRef} className="hidden" />

        {/* Interactive Floating Control Bar */}
        <div className="mt-6 p-4 rounded-2xl bg-black/40 border border-white/[0.02] flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 w-full md:w-auto justify-start flex-wrap">
            {/* Show Labels Toggle */}
            <label className="flex items-center gap-2 text-xs font-semibold text-[#8E8E93] cursor-pointer">
              <input 
                type="checkbox" 
                checked={showLabels} 
                onChange={(e) => setShowLabels(e.target.checked)} 
                className="w-4 h-4 rounded border-white/[0.08] bg-[#2C2C2E] accent-[#0A84FF] transition-all"
              />
              LABELS
            </label>

            {/* Bounding Box Style Selector */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">BOX STYLE:</span>
              <select 
                value={boxStyle} 
                onChange={(e) => setBoxStyle(e.target.value as "corners" | "outline" | "full")}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#2C2C2E]/60 border border-white/[0.04] text-white focus:outline-none focus:ring-1 focus:ring-[#0A84FF]/50"
              >
                <option value="corners">Apple Corners</option>
                <option value="outline">Google Dash</option>
                <option value="full">Solid Box</option>
              </select>
            </div>

            {/* Text To Speech Narration Reader Toggle */}
            <label className="flex items-center gap-2 text-xs font-semibold text-[#8E8E93] cursor-pointer">
              <input 
                type="checkbox" 
                checked={useTTS} 
                onChange={(e) => setUseTTS(e.target.checked)} 
                className="w-4 h-4 rounded border-white/[0.08] bg-[#2C2C2E] accent-[#0A84FF] transition-all"
              />
              VOICE (TTS)
            </label>
          </div>

          {/* Live Confidence Filter Slider */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <span className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wider">CONFIDENCE:</span>
            <input 
              type="range" 
              min="0.10" 
              max="0.90" 
              step="0.05" 
              value={confThreshold}
              onChange={(e) => setConfThreshold(parseFloat(e.target.value))}
              className="w-28 md:w-32 accent-[#0A84FF] h-1 bg-[#2C2C2E] rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-xs font-mono font-bold text-[#0A84FF] w-8">
              {Math.round(confThreshold * 100)}%
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
          {!isStreaming ? (
            <>
              <button
                id="btn-start-webcam"
                onClick={startWebcam}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#0A84FF] hover:bg-[#0070E3] text-white transition-all duration-300 font-semibold text-xs uppercase tracking-widest shadow-sm active:scale-95 cursor-pointer"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                  <circle cx="12" cy="13" r="4"></circle>
                </svg>
                Webcam Feed
              </button>

              <button
                id="btn-upload-video"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#2C2C2E]/60 border border-white/[0.04] text-white hover:bg-[#2C2C2E] transition-all duration-300 font-semibold text-xs uppercase tracking-widest active:scale-95 cursor-pointer"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                Upload Video
              </button>
              <input
                id="input-file-upload"
                type="file"
                ref={fileInputRef}
                accept="video/mp4,video/webm,video/ogg,video/avi"
                className="hidden"
                onChange={handleFileUpload}
              />
            </>
          ) : (
            <button
              id="btn-stop-stream"
              onClick={stopStream}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all duration-300 font-semibold text-xs uppercase tracking-widest active:scale-95 cursor-pointer"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
              </svg>
              Stop Stream
            </button>
          )}
        </div>
      </div>

      {/* Telemetry Diagnostics HUD Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
        
        {/* Hardware & Diagnostics Stat Cards */}
        <div className="backdrop-blur-3xl bg-[#1C1C1E]/60 border border-white/[0.04] shadow-[0_4px_30px_rgba(0,0,0,0.4)] rounded-3xl p-5 flex flex-col gap-4">
          <h4 className="text-[10px] font-bold tracking-widest text-[#8E8E93] uppercase border-b border-white/[0.04] pb-2">
            System Telemetry
          </h4>
          <div className="flex flex-col gap-3">
            {/* FPS Counter */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#8E8E93] font-semibold">FEED FRAME RATE</span>
              <span className="text-sm font-mono font-bold text-[#0A84FF]">{fps} FPS</span>
            </div>
            {/* Vector database search Latency */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#8E8E93] font-semibold">QDRANT QUERY LATENCY</span>
              <span className="text-sm font-mono font-bold text-emerald-500">{dbLatency} ms</span>
            </div>
            {/* Inference Acceleration Device */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#8E8E93] font-semibold">HARDWARE DEVICE</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                device.includes("CUDA") || device.includes("GPU")
                  ? "bg-green-500/10 text-green-400 border-green-500/20"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
              }`}>{device}</span>
            </div>
          </div>
        </div>

        {/* Live Diagnostics Health Connection Status */}
        <div className="backdrop-blur-3xl bg-[#1C1C1E]/60 border border-white/[0.04] shadow-[0_4px_30px_rgba(0,0,0,0.4)] rounded-3xl p-5 flex flex-col gap-4">
          <h4 className="text-[10px] font-bold tracking-widest text-[#8E8E93] uppercase border-b border-white/[0.04] pb-2">
            Service Health
          </h4>
          <div className="flex flex-col gap-3">
            {/* FastAPI Backend */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#8E8E93] font-semibold">FASTAPI BACKEND</span>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${apiStatus === "connected" ? "bg-green-500" : "bg-red-500"}`}></span>
                <span className="text-[10px] font-bold uppercase text-[#E5E5EA]">{apiStatus}</span>
              </div>
            </div>
            {/* Qdrant DB */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#8E8E93] font-semibold">QDRANT VECTOR DB</span>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${dbStatus === "connected" ? "bg-green-500" : "bg-red-500"}`}></span>
                <span className="text-[10px] font-bold uppercase text-[#E5E5EA]">{dbStatus}</span>
              </div>
            </div>
            {/* Gemini API Status */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#8E8E93] font-semibold">GOOGLE GEMINI 2.5</span>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isStreaming && apiStatus === "connected" ? "bg-green-500" : "bg-zinc-500"}`}></span>
                <span className="text-[10px] font-bold uppercase text-[#E5E5EA]">
                  {isStreaming && apiStatus === "connected" ? "ACTIVE" : "STANDBY"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Object Density Inventory HUD */}
        <div className="backdrop-blur-3xl bg-[#1C1C1E]/60 border border-white/[0.04] shadow-[0_4px_30px_rgba(0,0,0,0.4)] rounded-3xl p-5 flex flex-col gap-3">
          <h4 className="text-[10px] font-bold tracking-widest text-[#8E8E93] uppercase border-b border-white/[0.04] pb-2">
            Active Object Inventory
          </h4>
          <div className="flex flex-col gap-2 max-h-[100px] overflow-y-auto custom-scrollbar">
            {densityEntries.length > 0 ? (
              densityEntries.map(([label, count]) => (
                <div key={label} className="flex flex-col gap-1">
                  <div className="flex justify-between text-[11px] font-semibold text-[#E5E5EA]">
                    <span className="uppercase">{label}</span>
                    <span className="font-mono">{count}</span>
                  </div>
                  <div className="w-full bg-[#2C2C2E] h-1 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }} 
                      animate={{ width: `${Math.min(100, (count / 10) * 100)}%` }}
                      className="bg-[#0A84FF] h-full rounded-full"
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-[#8E8E93] text-[10px] py-4 italic">
                No items detected above conf threshold.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Face Registry HUD Row */}
      <AnimatePresence>
        {activeDetections.faces.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className="backdrop-blur-3xl bg-[#1C1C1E]/60 border border-white/[0.04] shadow-[0_4px_30px_rgba(0,0,0,0.4)] rounded-3xl p-5 w-full flex flex-col gap-4"
          >
            <h4 className="text-[10px] font-bold tracking-widest text-[#8E8E93] uppercase border-b border-white/[0.04] pb-2">
              Detected Face Registry
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {activeDetections.faces.map((face, index) => {
                if (face.confidence < confThreshold) return null;
                const genderLabel = face.gender === 1 ? "Male" : "Female";
                return (
                  <div key={index} className="flex items-center gap-3 p-3 rounded-2xl bg-[#2C2C2E]/40 border border-white/[0.02]">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#FF950A] to-[#FFD60A] flex items-center justify-center text-white font-bold text-sm shadow-md">
                      {genderLabel.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-[#E5E5EA]">{genderLabel}</span>
                      <span className="text-[10px] text-[#8E8E93] font-semibold">AGE EST: {face.age || "N/A"}</span>
                      <span className="text-[9px] text-[#FF950A] font-mono mt-0.5">MATCH: {Math.round(face.confidence * 100)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
});
