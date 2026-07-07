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

export function StreamController({ onNarrativeUpdate }: StreamControllerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamSource, setStreamSource] = useState<"webcam" | "video" | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);

  // Store latest detections to draw smoothly over the video
  const latestDetections = useRef<{ objects: DetectedObject[], faces: DetectedFace[] }>({ objects: [], faces: [] });

  const drawOverlay = useCallback(() => {
    if (!overlayCanvasRef.current || !videoRef.current) return;

    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext("2d");
    const video = videoRef.current;

    if (!ctx) return;

    // Match canvas dimensions to video actual size for proper coordinate mapping
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

    // Draw objects (Neon Blue/Cyan)
    objects.forEach((obj) => {
      const [x1, y1, x2, y2] = obj.bbox;
      const width = x2 - x1;
      const height = y2 - y1;

      ctx.strokeStyle = "rgba(6, 182, 212, 0.9)"; // Neon cyan-500
      ctx.lineWidth = 3;
      ctx.shadowColor = "rgba(6, 182, 212, 0.4)";
      ctx.shadowBlur = 8;
      ctx.strokeRect(x1, y1, width, height);

      // Label
      ctx.fillStyle = "rgba(6, 182, 212, 0.95)";
      const label = `${obj.label.toUpperCase()} ${(obj.confidence * 100).toFixed(0)}%`;
      ctx.font = "bold 13px sans-serif";
      const textWidth = ctx.measureText(label).width;

      ctx.fillRect(x1, y1 - 24, textWidth + 10, 24);
      ctx.fillStyle = "#0A0A0C";
      ctx.shadowBlur = 0;
      ctx.fillText(label, x1 + 5, y1 - 7);
    });

    // Draw faces (Pink/Magenta Glow)
    faces.forEach((face) => {
      const [x1, y1, x2, y2] = face.bbox;
      const width = x2 - x1;
      const height = y2 - y1;

      ctx.strokeStyle = "rgba(236, 72, 153, 0.9)"; // Neon pink-500
      ctx.lineWidth = 3;
      ctx.shadowColor = "rgba(236, 72, 153, 0.4)";
      ctx.shadowBlur = 8;
      ctx.strokeRect(x1, y1, width, height);

      // Label
      ctx.fillStyle = "rgba(236, 72, 153, 0.95)";
      const genderStr = face.gender === 1 ? "MALE" : "FEMALE";
      const label = `FACE: ${genderStr}${face.age ? " | AGE: " + face.age : ""}`;

      ctx.font = "bold 13px sans-serif";
      const textWidth = ctx.measureText(label).width;

      ctx.fillRect(x1, y1 - 24, textWidth + 10, 24);
      ctx.fillStyle = "#0A0A0C";
      ctx.shadowBlur = 0;
      ctx.fillText(label, x1 + 5, y1 - 7);
    });
  }, []);

  // Render loop to keep overlay matched with video
  useEffect(() => {
    let animationFrameId: number;

    const renderLoop = () => {
      if (isStreaming) {
        drawOverlay();
      } else {
        // clear if not streaming
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

    // Standard WebSocket target port 8000 for backend
    const wsUrl = `ws://127.0.0.1:8000/ws/stream`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log("WebSocket connected to backend");
    ws.onclose = () => console.log("WebSocket disconnected");
    ws.onerror = (error) => console.error("WebSocket error:", error);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.narrative && onNarrativeUpdate) {
          onNarrativeUpdate(data.narrative);
        }

        // Update local ref for overlay drawing
        latestDetections.current = {
          objects: data.objects || [],
          faces: data.faces || []
        };
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

    // Set matching backend frame skipping cadence (e.g. 5fps = 200ms)
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
      }, "image/jpeg", 0.7);
    }, 200); // 5 FPS
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
    if (file && (file.type === "video/mp4" || file.type === "video/x-msvideo" || file.name.endsWith('.avi') || file.name.endsWith('.mp4'))) {
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
    latestDetections.current = { objects: [], faces: [] };
  };

  const layoutTransition = {
    layout: {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1]
    } as const
  };

  return (
    <motion.div 
      layout 
      transition={layoutTransition.layout} 
      className="flex flex-col gap-6 w-full h-full max-w-4xl mx-auto"
    >
      <div className="glass-panel backdrop-blur-2xl border border-white/[0.08] shadow-[0_24px_50px_-12px_rgba(0,0,0,0.7)] bg-white/[0.02] rounded-3xl p-6 overflow-hidden relative group transition-all duration-300">
        
        {/* Main Video Viewport with Drag & Drop */}
        <div
          className={`relative rounded-2xl overflow-hidden bg-black/40 aspect-video flex items-center justify-center border transition-all duration-500 ${
            isDragging 
              ? 'border-cyan-400 ring-4 ring-cyan-500/30 scale-[0.99] shadow-[0_0_30px_rgba(6,182,212,0.4)]' 
              : 'border-white/[0.06]'
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
                className="absolute inset-0 bg-cyan-950/20 backdrop-blur-sm z-40 flex flex-col items-center justify-center text-cyan-400"
              >
                <motion.div
                  animate={{ y: [0, -12, 0] }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                  className="mb-4"
                >
                  {/* Upload SVG */}
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                </motion.div>
                <p className="text-sm font-bold uppercase tracking-wider">Drop to Ingest Video Stream</p>
                <p className="text-[10px] text-cyan-400/60 mt-1">Supports MP4, AVI</p>
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
                className="absolute inset-0 bg-[#0A0A0C]/90 backdrop-blur-md z-45 flex flex-col items-center justify-center text-cyan-400 gap-4"
              >
                <div className="relative w-14 h-14">
                  <span className="absolute inset-0 rounded-full border-4 border-cyan-500/10"></span>
                  <span className="absolute inset-0 rounded-full border-4 border-t-cyan-400 animate-spin"></span>
                </div>
                <p className="text-xs font-semibold tracking-widest uppercase text-cyan-400/80 animate-pulse">
                  Ingesting stream content...
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {!isStreaming && !isDragging && !isIngesting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/30 z-10 pointer-events-none gap-3">
              {/* Camera Icon */}
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
              <p className="text-xs font-medium tracking-wider uppercase">No active stream. Drag & Drop video here.</p>
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

        {/* Controls */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
          {!isStreaming ? (
            <>
              <button
                id="btn-start-webcam"
                onClick={startWebcam}
                className="flex items-center gap-2.5 px-6 py-3 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 font-semibold text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(6,182,212,0.25)] hover:shadow-[0_0_25px_rgba(6,182,212,0.45)] border border-cyan-400/20 active:scale-95 cursor-pointer"
              >
                {/* Camera SVG */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                  <circle cx="12" cy="13" r="4"></circle>
                </svg>
                Start Webcam
              </button>

              <button
                id="btn-upload-video"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2.5 px-6 py-3 rounded-full bg-white/[0.04] border border-white/[0.08] text-white hover:bg-white/[0.08] hover:border-white/[0.12] transition-all duration-300 font-semibold text-xs uppercase tracking-wider shadow-md active:scale-95 cursor-pointer"
              >
                {/* Upload SVG */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
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
                accept="video/mp4,video/webm,video/ogg,video/avi,video/x-msvideo"
                className="hidden"
                onChange={handleFileUpload}
              />
            </>
          ) : (
            <button
              id="btn-stop-stream"
              onClick={stopStream}
              className="flex items-center gap-2.5 px-6 py-3 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-all duration-300 font-semibold text-xs uppercase tracking-wider active:scale-95 cursor-pointer shadow-[0_0_15px_rgba(239,68,68,0.1)]"
            >
              {/* Stop SVG */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
              </svg>
              Stop Stream
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

