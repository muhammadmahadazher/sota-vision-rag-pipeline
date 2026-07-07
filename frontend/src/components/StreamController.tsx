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

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamSource, setStreamSource] = useState<"webcam" | "video" | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);

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

    // Draw objects (Apple System Blue)
    objects.forEach((obj) => {
      const [x1, y1, x2, y2] = obj.bbox;
      const width = x2 - x1;
      const height = y2 - y1;

      ctx.strokeStyle = "rgba(10, 132, 255, 0.95)"; // Apple System Blue
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = 4;
      ctx.strokeRect(x1, y1, width, height);

      // Label
      ctx.fillStyle = "rgba(10, 132, 255, 0.95)";
      const label = `${obj.label.toUpperCase()} ${(obj.confidence * 100).toFixed(0)}%`;
      ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, sans-serif";
      const textWidth = ctx.measureText(label).width;

      ctx.fillRect(x1, y1 - 20, textWidth + 8, 20);
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowBlur = 0;
      ctx.fillText(label, x1 + 4, y1 - 6);
    });

    // Draw faces (Apple System Orange)
    faces.forEach((face) => {
      const [x1, y1, x2, y2] = face.bbox;
      const width = x2 - x1;
      const height = y2 - y1;

      ctx.strokeStyle = "rgba(255, 159, 10, 0.95)"; // Apple System Orange
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = 4;
      ctx.strokeRect(x1, y1, width, height);

      // Label
      ctx.fillStyle = "rgba(255, 159, 10, 0.95)";
      const genderStr = face.gender === 1 ? "MALE" : "FEMALE";
      const label = `FACE: ${genderStr}${face.age ? " | AGE: " + face.age : ""}`;

      ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, sans-serif";
      const textWidth = ctx.measureText(label).width;

      ctx.fillRect(x1, y1 - 20, textWidth + 8, 20);
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowBlur = 0;
      ctx.fillText(label, x1 + 4, y1 - 6);
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
    const wsUrl = `ws://127.0.0.1:8000/api/stream`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log("WebSocket connected to backend");
    ws.onclose = () => console.log("WebSocket disconnected");
    ws.onerror = (error) => console.error("WebSocket error:", error);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === "Stream Disconnected") {
          setIsDisconnected(true);
        }
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
    setIsDisconnected(false);
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
                  {/* Upload SVG */}
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_0_8px_rgba(10,132,255,0.4)]">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                </motion.div>
                <p className="text-xs font-bold uppercase tracking-widest">Drop video file here</p>
                <p className="text-[10px] text-[#0A84FF]/60 mt-1 uppercase font-semibold tracking-wider">MP4, AVI</p>
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
              {/* Camera Icon */}
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

        {/* Controls */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
          {!isStreaming ? (
            <>
              <button
                id="btn-start-webcam"
                onClick={startWebcam}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#0A84FF] hover:bg-[#0070E3] text-white transition-all duration-300 font-semibold text-xs uppercase tracking-widest shadow-sm active:scale-95 cursor-pointer"
              >
                {/* Camera SVG */}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                  <circle cx="12" cy="13" r="4"></circle>
                </svg>
                Webcam
              </button>

              <button
                id="btn-upload-video"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#2C2C2E]/60 border border-white/[0.04] text-white hover:bg-[#2C2C2E] transition-all duration-300 font-semibold text-xs uppercase tracking-widest active:scale-95 cursor-pointer"
              >
                {/* Upload SVG */}
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
                accept="video/mp4,video/webm,video/ogg,video/avi,video/x-msvideo"
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
              {/* Stop SVG */}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
              </svg>
              Stop
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
});


