"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Camera, Upload, Square } from "lucide-react";
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

    // Draw objects (Blue)
    objects.forEach((obj) => {
      const [x1, y1, x2, y2] = obj.bbox;
      const width = x2 - x1;
      const height = y2 - y1;

      ctx.strokeStyle = "rgba(59, 130, 246, 0.8)"; // Tailwind blue-500
      ctx.lineWidth = 3;
      ctx.strokeRect(x1, y1, width, height);

      // Label
      ctx.fillStyle = "rgba(59, 130, 246, 0.9)";
      const label = `${obj.label} ${(obj.confidence * 100).toFixed(0)}%`;
      ctx.font = "14px sans-serif";
      const textWidth = ctx.measureText(label).width;

      ctx.fillRect(x1, y1 - 24, textWidth + 8, 24);
      ctx.fillStyle = "white";
      ctx.fillText(label, x1 + 4, y1 - 8);
    });

    // Draw faces (Pink)
    faces.forEach((face) => {
      const [x1, y1, x2, y2] = face.bbox;
      const width = x2 - x1;
      const height = y2 - y1;

      ctx.strokeStyle = "rgba(236, 72, 153, 0.8)"; // Tailwind pink-500
      ctx.lineWidth = 3;
      ctx.strokeRect(x1, y1, width, height);

      // Label
      ctx.fillStyle = "rgba(236, 72, 153, 0.9)";
      const genderStr = face.gender === 1 ? "M" : "F";
      const label = `Face ${genderStr}${face.age ? ", " + face.age : ''}`;

      ctx.font = "14px sans-serif";
      const textWidth = ctx.measureText(label).width;

      ctx.fillRect(x1, y1 - 24, textWidth + 8, 24);
      ctx.fillStyle = "white";
      ctx.fillText(label, x1 + 4, y1 - 8);
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

    const ws = new WebSocket("ws://localhost:8000/ws/stream");

    ws.onopen = () => console.log("WebSocket connected");
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setStreamSource("webcam");
        setIsStreaming(true);
      }
    } catch (err) {
      console.error("Error accessing webcam:", err);
    }
  };

  const processFile = (file: File) => {
    if (file && videoRef.current) {
      const url = URL.createObjectURL(file);
      videoRef.current.srcObject = null;
      videoRef.current.src = url;
      videoRef.current.play();
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
    if (file && (file.type === "video/mp4" || file.type === "video/x-msvideo" || file.name.endsWith('.avi'))) {
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

  return (
    <motion.div layout className="flex flex-col gap-6 w-full h-full max-w-4xl mx-auto">
      <div className="glass-panel backdrop-blur-xl border border-white/10 dark:border-black/20 shadow-2xl rounded-3xl p-4 overflow-hidden relative group transition-all duration-300">

        {/* Main Video Viewport with Drag & Drop */}
        <div
          className={`relative rounded-2xl overflow-hidden bg-black/5 dark:bg-white/5 aspect-video flex items-center justify-center border border-black/5 dark:border-white/5 transition-all duration-300 ${isDragging ? 'ring-4 ring-blue-500/50 scale-[0.98]' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <AnimatePresence>
            {isDragging && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute inset-0 bg-blue-500/10 backdrop-blur-sm z-40 flex flex-col items-center justify-center text-blue-500"
              >
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                >
                  <Upload className="w-16 h-16 mb-4" />
                </motion.div>
                <p className="text-lg font-bold">Drop to Ingest Video Stream</p>
              </motion.div>
            )}
          </AnimatePresence>

          {!isStreaming && !isDragging && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-foreground/50 z-10 pointer-events-none">
              <Camera className="w-12 h-12 mb-4 opacity-50" />
              <p className="font-medium">No active stream. Drag & Drop a video file here.</p>
            </div>
          )}

          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-contain z-20 pointer-events-none"
            playsInline
            muted
            loop={streamSource === "video"}
          />

          <canvas
            ref={overlayCanvasRef}
            className="absolute inset-0 w-full h-full object-contain z-30 pointer-events-none"
          />
        </div>

        {/* Hidden Extraction Canvas */}
        <canvas ref={hiddenCanvasRef} className="hidden" />

        {/* Controls */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          {!isStreaming ? (
            <>
              <button
                onClick={startWebcam}
                className="flex items-center gap-2 px-6 py-3 rounded-full bg-foreground text-background hover:opacity-90 transition-opacity font-medium text-sm shadow-lg cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                Start Webcam
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-6 py-3 rounded-full glass-panel hover:bg-black/5 dark:hover:bg-white/5 transition-colors font-medium text-sm shadow-sm cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                Upload Video
              </button>
              <input
                type="file"
                ref={fileInputRef}
                accept="video/mp4,video/webm,video/ogg,video/avi,video/x-msvideo"
                className="hidden"
                onChange={handleFileUpload}
              />
            </>
          ) : (
            <button
              onClick={stopStream}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors font-medium text-sm cursor-pointer"
            >
              <Square className="w-4 h-4 fill-current" />
              Stop Stream
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
